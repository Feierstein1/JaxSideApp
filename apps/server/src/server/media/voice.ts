import { randomBytes } from 'node:crypto';
import type { User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { enforce } from '../rate-limit';
import { objectStore } from './store';
import { boxes, children, durationMs, handler, only, scrubMetadata, type Fail } from './mp4';
import { signedPhotoUrl } from './photos';

/**
 * D75: voice posts. The phone records AAC audio in an MP4 (.m4a) container. Without a
 * transcoder on the server, the file is checked structurally instead of re-encoded:
 * - it must be an MP4 audio file (known brand, one moov, audio tracks only: a video
 *   track is refused, so voice uploads can't smuggle video);
 * - its declared length must be within the limit;
 * - metadata boxes (`udta`, `meta`, `uuid`: where a recorder could put a location or
 *   device name) are zeroed and renamed to `free`, which players skip. Sizes and offsets
 *   don't change, so the audio plays exactly as recorded.
 */

const BRANDS = /^(M4A |M4B |mp41|mp42|isom|iso2|iso4|iso5|iso6|3gp4|3gp5|3gp6|3g2a|dash)$/;
const TOP_LEVEL = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'udta', 'meta', 'uuid']);
const MIN_MS = 500;

const bad: Fail = (msg = 'That recording couldn’t be read. Try recording it again.') =>
  new ApiError(422, 'INVALID_AUDIO', msg);

export async function processVoice(input: Buffer, maxSeconds: number) {
  const buf = Buffer.from(input); // never modify the caller's buffer
  if (buf.length < 16 || buf.toString('latin1', 4, 8) !== 'ftyp') {
    throw bad('Please send a voice recording (.m4a).');
  }
  const top = boxes(buf, 0, buf.length, bad);
  const ftyp = top[0]!;
  if (ftyp.size < 16 || !BRANDS.test(buf.toString('latin1', ftyp.start + 8, ftyp.start + 12))) {
    throw bad('Please send a voice recording (.m4a).');
  }
  if (top.some((b) => !TOP_LEVEL.has(b.type))) throw bad();
  const moovs = only(top, 'moov');
  if (moovs.length !== 1 || !only(top, 'mdat').length) throw bad();
  const moovKids = children(buf, moovs[0]!, bad);
  const mvhd = only(moovKids, 'mvhd')[0];
  if (!mvhd) throw bad();
  const traks = only(moovKids, 'trak');
  if (!traks.length) throw bad();
  if (traks.some((t) => handler(buf, t, bad) !== 'soun')) {
    throw bad('Voice posts can only contain audio.');
  }
  const ms = durationMs(buf, mvhd, bad);
  if (ms < MIN_MS) throw bad('That recording is too short.');
  if (ms > maxSeconds * 1000 + 1000) {
    throw bad(`Voice posts can be up to ${maxSeconds} seconds.`);
  }
  scrubMetadata(buf, top);
  scrubMetadata(buf, moovKids);
  for (const t of traks) scrubMetadata(buf, children(buf, t, bad));
  return { data: buf, durationMs: ms };
}

export async function uploadVoice(user: User, body: Buffer, now = new Date()) {
  const [maxMB, maxSeconds] = await Promise.all([
    getConfig('voice.maxUploadMB'),
    getConfig('voice.maxSeconds'),
  ]);
  if (body.length > maxMB * 1024 * 1024) {
    throw new ApiError(413, 'TOO_LARGE', `Voice clips can be up to ${maxMB} MB.`);
  }
  // Shares the daily upload allowance with photos.
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
  const clean = await processVoice(body, maxSeconds);
  const storageKey = `voice/${randomBytes(24).toString('hex')}.m4a`;
  await objectStore().put(storageKey, clean.data, 'audio/mp4');
  const clip = await db.photo.create({
    data: {
      uploaderId: user.id,
      kind: 'AUDIO',
      storageKey,
      status: 'ACTIVE',
      mimeType: 'audio/mp4',
      durationMs: clean.durationMs,
      bytes: clean.data.length,
      processedAt: now,
      createdAt: now,
    },
  });
  return { id: clip.id, durationMs: clean.durationMs, url: signedPhotoUrl(clip.id, now) };
}
