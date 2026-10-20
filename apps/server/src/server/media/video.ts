import { randomBytes } from 'node:crypto';
import type { User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { enforce } from '../rate-limit';
import {
  blank,
  boxes,
  children,
  durationMs,
  handler,
  only,
  scrubMetadata,
  trackSize,
  zeroTrackSamples,
  type Fail,
} from './mp4';
import { signedPhotoUrl } from './photos';
import { objectStore } from './store';

/**
 * D102: video posts, the free way (no transcoding). The phone's own MP4 / QuickTime (.mov)
 * file is checked structurally and cleaned in place:
 * - it must be a known MP4/QuickTime brand with exactly one `moov` and at least one video
 *   track; only video and audio tracks are kept;
 * - other tracks (an iPhone's timed metadata, timecode, subtitles…) are removed: their
 *   samples are zeroed in the media data and the track itself is blanked;
 * - metadata boxes (`udta`, `meta`, `uuid`: location, device, software) are blanked at every
 *   level, and track references to removed tracks too;
 * - length ≤ the limit (30 s) and size ≤ 25 MB.
 * Sizes and offsets never change, so it plays as recorded. Without re-encoding, a phone
 * that can't decode the recording's format (e.g. HEVC on an old Android) can't play it.
 */

const BRANDS =
  /^(isom|iso2|iso4|iso5|iso6|mp41|mp42|qt {2}|avc1|M4V |M4VH|M4VP|3gp4|3gp5|3gp6|3g2a|dash|MSNV|XAVC)$/;
const TOP_LEVEL = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'udta', 'meta', 'uuid']);
const KEEP_TRACKS = new Set(['vide', 'soun']);
const MIN_MS = 500;

const bad: Fail = (msg = 'That video couldn’t be read. Try another one.') =>
  new ApiError(422, 'INVALID_VIDEO', msg);

export async function processVideo(input: Buffer, maxSeconds: number) {
  const buf = Buffer.from(input); // never modify the caller's buffer
  if (buf.length < 16 || buf.toString('latin1', 4, 8) !== 'ftyp') {
    throw bad('Please choose a video (MP4 or MOV).');
  }
  const top = boxes(buf, 0, buf.length, bad);
  const ftyp = top[0]!;
  const brand = buf.toString('latin1', ftyp.start + 8, ftyp.start + 12);
  if (ftyp.size < 16 || !BRANDS.test(brand)) throw bad('Please choose a video (MP4 or MOV).');
  if (top.some((b) => !TOP_LEVEL.has(b.type))) throw bad();
  const moovs = only(top, 'moov');
  if (moovs.length !== 1 || !only(top, 'mdat').length) throw bad();
  const moovKids = children(buf, moovs[0]!, bad);
  const mvhd = only(moovKids, 'mvhd')[0];
  if (!mvhd) throw bad();
  const traks = only(moovKids, 'trak').map((t) => ({ box: t, type: handler(buf, t, bad) }));
  const video = traks.find((t) => t.type === 'vide');
  if (!video) throw bad('That file has no video in it.');
  const ms = durationMs(buf, mvhd, bad);
  if (ms < MIN_MS) throw bad('That video is too short.');
  if (ms > maxSeconds * 1000 + 1000) throw bad(`Videos can be up to ${maxSeconds} seconds.`);
  const size = trackSize(buf, video.box, bad);

  // Remove everything that isn't picture or sound, then the metadata boxes everywhere.
  for (const t of traks) {
    if (KEEP_TRACKS.has(t.type)) continue;
    zeroTrackSamples(buf, t.box, bad);
    blank(buf, t.box);
  }
  scrubMetadata(buf, top);
  scrubMetadata(buf, moovKids);
  for (const t of traks) {
    if (!KEEP_TRACKS.has(t.type)) continue;
    const kids = children(buf, t.box, bad);
    scrubMetadata(buf, kids);
    for (const tref of only(kids, 'tref')) blank(buf, tref); // links to removed tracks
  }
  return {
    data: buf,
    durationMs: ms,
    width: size.width,
    height: size.height,
    mimeType: brand === 'qt  ' ? ('video/quicktime' as const) : ('video/mp4' as const),
  };
}

export async function uploadVideo(user: User, body: Buffer, now = new Date()) {
  const [maxMB, maxSeconds] = await Promise.all([
    getConfig('video.maxUploadMB'),
    getConfig('video.maxSeconds'),
  ]);
  if (body.length > maxMB * 1024 * 1024) {
    throw new ApiError(413, 'TOO_LARGE', `Videos can be up to ${maxMB} MB.`);
  }
  // Shares the daily upload allowance with photos and voice clips.
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
  const clean = await processVideo(body, maxSeconds);
  const ext = clean.mimeType === 'video/quicktime' ? 'mov' : 'mp4';
  const storageKey = `videos/${randomBytes(24).toString('hex')}.${ext}`;
  await objectStore().put(storageKey, clean.data, clean.mimeType);
  const v = await db.photo.create({
    data: {
      uploaderId: user.id,
      kind: 'VIDEO',
      storageKey,
      status: 'ACTIVE',
      mimeType: clean.mimeType,
      durationMs: clean.durationMs,
      width: clean.width || null,
      height: clean.height || null,
      bytes: clean.data.length,
      processedAt: now,
      createdAt: now,
    },
  });
  return {
    id: v.id,
    durationMs: clean.durationMs,
    width: clean.width,
    height: clean.height,
    url: signedPhotoUrl(v.id, now),
  };
}
