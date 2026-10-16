import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import sharp, { type Sharp } from 'sharp';
import type { Prisma, User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { getEnv } from '../env';
import { ApiError } from '../http';
import { enforce } from '../rate-limit';
import { imageClassifier } from './classifier';
import { objectStore } from './store';

/**
 * P6.1–P6.5 photos (§12, D65).
 *
 * Upload: the app sends the image bytes to the API (registered, confirmed users only,
 * rate-limited). The server checks the real file type from its first bytes (not the
 * name), enforces size and pixel limits, then **re-encodes** it with sharp: rotated
 * upright, resized to at most 1600 px, saved as JPEG with **all metadata dropped**
 * (EXIF, GPS, camera details). Only the clean copy is stored, under a random key, in
 * a private bucket. The original bytes are never stored.
 *
 * Delivery: posts carry short-lived signed links to `/api/v1/photos/:id`, which checks
 * the photo is still live and streams it. Removed or unknown photos return 404.
 */

const MAX_EDGE = 1600;
const MAX_INPUT_PIXELS = 40_000_000; // ~ 7700 × 5200
const LINK_TTL_SECONDS = 3600;

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'heif';

/** Real file type from the first bytes. Anything else (scripts, PDFs, SVG…) is refused. */
export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  // HEIC/HEIF (iPhone): "ftyp" box with a heic/heix/mif1 brand.
  if (
    buf.toString('ascii', 4, 8) === 'ftyp' &&
    /^(heic|heix|hevc|mif1|msf1)$/.test(buf.toString('ascii', 8, 12))
  ) {
    return 'heif';
  }
  return null;
}

const refuse = (msg: string) => new ApiError(422, 'INVALID_IMAGE', msg);

/** Re-encodes to a clean JPEG with no metadata. Exported for the EXIF test (P6.3). */
export async function processImage(buf: Buffer) {
  const kind = sniffImage(buf);
  if (!kind) throw refuse('Please choose a photo (JPEG, PNG, WebP or HEIC).');
  let img: Sharp;
  try {
    img = sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new Error('no size');
    if (meta.width < 32 || meta.height < 32) throw refuse('That image is too small.');
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw refuse(
      kind === 'heif'
        ? 'This HEIC photo couldn’t be read. Try again; the app converts photos to JPEG.'
        : 'That file couldn’t be read as a photo.',
    );
  }
  // rotate() applies the camera orientation; sharp writes no metadata unless asked to.
  const { data, info } = await img
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, mimeType: 'image/jpeg' as const };
}

export async function uploadPhoto(user: User, body: Buffer, now = new Date()) {
  const maxBytes = (await getConfig('photos.maxUploadMB')) * 1024 * 1024;
  if (body.length > maxBytes) {
    throw new ApiError(413, 'TOO_LARGE', `Photos can be up to ${maxBytes / 1024 / 1024} MB.`);
  }
  await enforce(
    [
      {
        key: `upload-day:user:${user.id}`,
        limitKey: 'rateLimit.upload.perDay',
        windowSeconds: 86_400,
      },
    ],
    now,
  );
  const clean = await processImage(body);
  // P6.6: optional automated screening (none configured by default). Until a review
  // flow for held photos exists, "hold" is treated like "block".
  const verdict = await imageClassifier().classify(clean.data);
  if (verdict.action !== 'allow') throw refuse('This photo can’t be posted.');

  const storageKey = `photos/${randomBytes(24).toString('hex')}.jpg`;
  await objectStore().put(storageKey, clean.data, clean.mimeType);
  const photo = await db.photo.create({
    data: {
      uploaderId: user.id,
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
    id: photo.id,
    width: clean.width,
    height: clean.height,
    url: signedPhotoUrl(photo.id, now),
  };
}

/**
 * Attaches the uploader's own unattached photos to a new post (P6.1: ownership is
 * checked here, never trusted from the client).
 */
export async function attachPhotos(
  tx: Prisma.TransactionClient,
  userId: string,
  photoIds: string[],
  target: { generalPostId: string } | { businessPostId: string },
) {
  if (!photoIds.length) return;
  const res = await tx.photo.updateMany({
    where: {
      id: { in: photoIds },
      uploaderId: userId,
      status: 'ACTIVE',
      generalPostId: null,
      businessPostId: null,
      avatarOf: null,
    },
    data: target,
  });
  if (res.count !== new Set(photoIds).size) {
    throw new ApiError(
      400,
      'INVALID_PHOTO',
      'One of the photos can’t be used. Try adding it again.',
    );
  }
}

// ───────────────────────────── Signed links ─────────────────────────────

function sig(id: string, exp: number) {
  return createHmac('sha256', getEnv().SESSION_SECRET)
    .update(`photo:${id}:${exp}`)
    .digest('base64url');
}

/** A link that works for an hour (relative; the app prefixes its server address). */
export function signedPhotoUrl(id: string, now = new Date()) {
  // Round the expiry so the same photo gets the same link for a while (image caching).
  const exp = Math.ceil(now.getTime() / 1000 / 600) * 600 + LINK_TTL_SECONDS;
  return `/api/v1/photos/${id}?exp=${exp}&sig=${sig(id, exp)}`;
}

export function checkSignature(
  id: string,
  exp: string | null,
  given: string | null,
  now = new Date(),
) {
  const e = Number(exp);
  if (!Number.isInteger(e) || e < now.getTime() / 1000 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(sig(id, e));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** P6.4: bytes for a live photo, or null (removed, never processed, unknown). */
export async function readPhoto(id: string) {
  const p = await db.photo.findUnique({
    where: { id },
    include: {
      generalPost: { select: { status: true } },
      businessPost: { select: { status: true } },
      avatarOf: { select: { userId: true, user: { select: { status: true } } } },
    },
  });
  if (!p || p.status !== 'ACTIVE' || !p.storageKey) return null;
  // A photo on a post is only served while the post is visible; an avatar while the
  // account is active. Unattached photos are only for their uploader's compose preview.
  const post = p.generalPost ?? p.businessPost;
  if (post && post.status !== 'VISIBLE') return null;
  if (p.avatarOf && p.avatarOf.user.status !== 'ACTIVE') return null;
  const body = await objectStore().get(p.storageKey);
  return body ? { body, mimeType: p.mimeType ?? 'image/jpeg' } : null;
}

/** Daily job: photos never attached to anything after a day are deleted. */
export async function purgeUnusedPhotos(now = new Date()) {
  const stale = await db.photo.findMany({
    where: {
      createdAt: { lt: new Date(now.getTime() - 86_400_000) },
      generalPostId: null,
      businessPostId: null,
      avatarOf: null,
      status: 'ACTIVE',
    },
    select: { id: true, storageKey: true },
    take: 500,
  });
  for (const p of stale) {
    if (p.storageKey)
      await objectStore()
        .delete(p.storageKey)
        .catch(() => undefined);
  }
  await db.photo.deleteMany({ where: { id: { in: stale.map((p) => p.id) } } });
  return stale.length;
}
