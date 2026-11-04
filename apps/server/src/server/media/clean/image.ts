/**
 * D195: media cleaning, shared with the owner website. The JaxSideBusiness repo copies this
 * folder as-is (like `shared/`), so both sides clean uploads the same way. Keep it
 * self-contained: no imports outside this folder except `sharp` and Node built-ins. The app
 * is the source; change it here and tell the website (hub inbox) to copy it again.
 */

import sharp, { type Sharp } from 'sharp';
import { MediaRefused } from './refused';

const MAX_EDGE = 1600;
const MAX_INPUT_PIXELS = 40_000_000; // ~ 7700 × 5200
// D74: animated GIFs stay animated, re-encoded (no metadata) and kept small.
const GIF_MAX_EDGE = 600;
const GIF_MAX_FRAMES = 300;
const GIF_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'heif' | 'gif';

/** Real file type from the first bytes. Anything else (scripts, PDFs, SVG…) is refused. */
export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (/^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return 'gif';
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

const refuse = (msg: string) => new MediaRefused('INVALID_IMAGE', msg);

/** Re-encodes to a clean JPEG with no metadata (P6.3), or a fresh GIF (D74). */
export async function cleanImage(buf: Buffer) {
  const kind = sniffImage(buf);
  if (!kind) throw refuse('Please choose a photo or GIF (JPEG, PNG, WebP, HEIC or GIF).');
  if (kind === 'gif') return processGif(buf);
  let img: Sharp;
  try {
    img = sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new Error('no size');
    if (meta.width < 32 || meta.height < 32) throw refuse('That image is too small.');
  } catch (err) {
    if (err instanceof MediaRefused) throw err;
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

/**
 * D74: GIFs are decoded frame by frame and written out as a fresh GIF (so nothing but the
 * frames survives), at most 600 px on the longest side and 300 frames.
 */
async function processGif(buf: Buffer) {
  let img: Sharp;
  let frames: number;
  try {
    img = sharp(buf, { animated: true, limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    const meta = await img.metadata();
    const height = meta.pageHeight ?? meta.height;
    if (!meta.width || !height) throw new Error('no size');
    if (meta.width < 32 || height < 32) throw refuse('That image is too small.');
    frames = meta.pages ?? 1;
  } catch (err) {
    if (err instanceof MediaRefused) throw err;
    throw refuse('That GIF couldn’t be read.');
  }
  if (frames > GIF_MAX_FRAMES) throw refuse('That GIF is too long. Try a shorter one.');
  const { data, info } = await img
    .resize({ width: GIF_MAX_EDGE, height: GIF_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .gif()
    .toBuffer({ resolveWithObject: true });
  if (data.length > GIF_MAX_OUTPUT_BYTES) {
    throw refuse('That GIF is too large. Try a shorter or smaller one.');
  }
  return {
    data,
    width: info.width,
    height: info.pageHeight ?? info.height,
    mimeType: 'image/gif' as const,
  };
}
