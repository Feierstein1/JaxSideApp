import { randomBytes } from 'node:crypto';
import sharp, { type Sharp } from 'sharp';
import { AD_GIF_LIMITS, AD_TEMPLATES, checkAdImage, type AdTemplateKind } from '@jax/shared';
import type { BusinessAccount } from '@/generated/prisma/client';
import { db } from './db';
import { ApiError } from './http';
import { requirePlace } from './places';
import { enforce } from './rate-limit';
import { objectStore } from './store';

/**
 * B3.2: ad pictures and GIFs (same rules as the app's photos, D65 / D74). The real file
 * type comes from the first bytes (never the name); the picture must fit the template's
 * shape and minimum size (D177); then it's re-encoded at exactly the template's size with
 * all metadata dropped (EXIF, GPS, camera). Only the clean copy is stored.
 */

/** Largest upload accepted before any processing. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const UPLOADS_PER_DAY = { limit: 60, windowSeconds: 86_400 };

type Kind = 'jpeg' | 'png' | 'webp' | 'heif' | 'gif';

export function sniffImage(buf: Buffer): Kind | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (/^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return 'gif';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (
    buf.toString('ascii', 4, 8) === 'ftyp' &&
    /^(heic|heix|hevc|mif1|msf1)$/.test(buf.toString('ascii', 8, 12))
  ) {
    return 'heif';
  }
  return null;
}

const refuse = (message: string, problems?: string[]) =>
  new ApiError(422, 'INVALID_IMAGE', message, problems ? { problems } : undefined);

/** Checks and re-encodes a picture for a template. Exported for tests. */
export async function processAdImage(template: AdTemplateKind, buf: Buffer) {
  const kind = sniffImage(buf);
  if (!kind) throw refuse('Please choose a picture or GIF (JPEG, PNG, WebP, HEIC or GIF).');
  const gif = kind === 'gif';
  let img: Sharp;
  let width: number;
  let height: number;
  let frames: number;
  let seconds: number;
  try {
    img = sharp(buf, { animated: gif, limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    const meta = await img.metadata();
    width = meta.width ?? 0;
    height = (gif ? meta.pageHeight : undefined) ?? meta.height ?? 0;
    if (!width || !height) throw new Error('no size');
    frames = meta.pages ?? 1;
    seconds = (meta.delay ?? []).reduce((a, d) => a + d, 0) / 1000;
    // Upright first (phone photos store their rotation separately).
    if (!gif && meta.orientation && meta.orientation >= 5) [width, height] = [height, width];
  } catch {
    throw refuse('That file couldn’t be read as a picture.');
  }
  if (gif && (frames > AD_GIF_LIMITS.maxFrames || seconds > AD_GIF_LIMITS.maxSeconds)) {
    throw refuse(
      `That GIF is too long. Keep it under ${AD_GIF_LIMITS.maxSeconds} seconds and ${AD_GIF_LIMITS.maxFrames} frames.`,
    );
  }
  // Shape and minimum size against the template (the file size is checked after cleaning).
  const shapeProblems = checkAdImage(template, { width, height, bytes: 0, gif });
  if (shapeProblems.length) throw refuse(shapeProblems.join(' '), shapeProblems);

  const t = AD_TEMPLATES[template].image;
  const resized = (gif ? img : img.rotate()).resize({
    width: t.width,
    height: t.height,
    fit: 'cover',
    position: 'centre',
  });
  const { data, info } = gif
    ? await resized.gif().toBuffer({ resolveWithObject: true })
    : await resized
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 84, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
  const sizeProblems = checkAdImage(template, {
    width: t.width,
    height: t.height,
    bytes: data.length,
    gif,
  });
  if (sizeProblems.length) throw refuse(sizeProblems.join(' '), sizeProblems);
  return {
    data,
    width: info.width,
    height: gif ? (info.pageHeight ?? info.height) : info.height,
    mimeType: gif ? ('image/gif' as const) : ('image/jpeg' as const),
  };
}

/** Uploads a picture for one of the business's ads at this place (Owner or Manager). */
export async function uploadAdMedia(
  account: BusinessAccount,
  placeId: string,
  template: AdTemplateKind,
  body: Buffer,
  now = new Date(),
) {
  await requirePlace(account.id, placeId, 'ads');
  if (body.length > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, 'TOO_LARGE', 'Pictures can be up to 12 MB before they’re resized.');
  }
  await enforce([{ key: `ad-upload:acct:${account.id}`, ...UPLOADS_PER_DAY }], now);
  const clean = await processAdImage(template, body);
  const ownerId = account.createdById ?? account.id;
  const ext = clean.mimeType === 'image/gif' ? 'gif' : 'jpg';
  const storageKey = `ads/${randomBytes(24).toString('hex')}.${ext}`;
  await objectStore().put(storageKey, clean.data, clean.mimeType);
  const media = await db.adMedia.create({
    data: {
      accountId: ownerId,
      storageKey,
      status: 'ACTIVE',
      mimeType: clean.mimeType,
      width: clean.width,
      height: clean.height,
      bytes: clean.data.length,
      processedAt: now,
      createdAt: now,
    },
  });
  return {
    id: media.id,
    width: clean.width,
    height: clean.height,
    gif: clean.mimeType === 'image/gif',
  };
}

/** 🔒 A picture's bytes, only for members of the business that uploaded it. */
export async function readAdMedia(account: BusinessAccount, mediaId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return null;
  const m = await db.adMedia.findUnique({ where: { id: mediaId } });
  const ownerId = account.createdById ?? account.id;
  if (!m || m.accountId !== ownerId || m.status !== 'ACTIVE' || !m.storageKey) return null;
  const body = await objectStore().get(m.storageKey);
  return body ? { body, mimeType: m.mimeType ?? 'image/jpeg' } : null;
}
