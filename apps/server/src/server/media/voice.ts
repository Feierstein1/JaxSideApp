import { randomBytes } from 'node:crypto';
import type { User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { enforce } from '../rate-limit';
import { objectStore } from './store';
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
const SCRUB = new Set(['udta', 'meta', 'uuid']);
const MIN_MS = 500;

interface Box {
  type: string;
  start: number;
  size: number;
  header: number;
}

const bad = (msg = 'That recording couldn’t be read. Try recording it again.') =>
  new ApiError(422, 'INVALID_AUDIO', msg);

function boxes(buf: Buffer, start: number, end: number): Box[] {
  const out: Box[] = [];
  let off = start;
  while (off < end) {
    if (off + 8 > end) throw bad();
    let size = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    let header = 8;
    if (size === 1) {
      if (off + 16 > end) throw bad();
      size = Number(buf.readBigUInt64BE(off + 8));
      header = 16;
    } else if (size === 0) {
      size = end - off; // runs to the end of its parent
    }
    if (size < header || off + size > end) throw bad();
    out.push({ type, start: off, size, header });
    off += size;
  }
  return out;
}

const children = (buf: Buffer, b: Box) => boxes(buf, b.start + b.header, b.start + b.size);
const only = (list: Box[], type: string) => list.filter((b) => b.type === type);

function scrub(buf: Buffer, list: Box[]) {
  for (const b of list) {
    if (!SCRUB.has(b.type)) continue;
    buf.write('free', b.start + 4, 'latin1'); // players skip it…
    buf.fill(0, b.start + b.header, b.start + b.size); // …and its contents are gone
  }
}

/** Length in ms from the movie header (`mvhd`, version 0 or 1). */
function durationMs(buf: Buffer, mvhd: Box): number {
  const c = mvhd.start + mvhd.header;
  if (mvhd.size < mvhd.header + 32) throw bad();
  const version = buf[c];
  const [scale, dur] =
    version === 1
      ? [buf.readUInt32BE(c + 20), Number(buf.readBigUInt64BE(c + 24))]
      : [buf.readUInt32BE(c + 12), buf.readUInt32BE(c + 16)];
  if (!scale) throw bad();
  return Math.round((dur / scale) * 1000);
}

/** The handler type of a track (`soun` for audio, `vide` for video). */
function handler(buf: Buffer, trak: Box): string {
  const mdia = only(children(buf, trak), 'mdia')[0];
  const hdlr = mdia && only(children(buf, mdia), 'hdlr')[0];
  if (!hdlr || hdlr.size < hdlr.header + 12) throw bad();
  return buf.toString('latin1', hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12);
}

export async function processVoice(input: Buffer, maxSeconds: number) {
  const buf = Buffer.from(input); // never modify the caller's buffer
  if (buf.length < 16 || buf.toString('latin1', 4, 8) !== 'ftyp') {
    throw bad('Please send a voice recording (.m4a).');
  }
  const top = boxes(buf, 0, buf.length);
  const ftyp = top[0]!;
  if (ftyp.size < 16 || !BRANDS.test(buf.toString('latin1', ftyp.start + 8, ftyp.start + 12))) {
    throw bad('Please send a voice recording (.m4a).');
  }
  if (top.some((b) => !TOP_LEVEL.has(b.type))) throw bad();
  const moovs = only(top, 'moov');
  if (moovs.length !== 1 || !only(top, 'mdat').length) throw bad();
  const moovKids = children(buf, moovs[0]!);
  const mvhd = only(moovKids, 'mvhd')[0];
  if (!mvhd) throw bad();
  const traks = only(moovKids, 'trak');
  if (!traks.length) throw bad();
  if (traks.some((t) => handler(buf, t) !== 'soun')) {
    throw bad('Voice posts can only contain audio.');
  }
  const ms = durationMs(buf, mvhd);
  if (ms < MIN_MS) throw bad('That recording is too short.');
  if (ms > maxSeconds * 1000 + 1000) {
    throw bad(`Voice posts can be up to ${maxSeconds} seconds.`);
  }
  scrub(buf, top);
  scrub(buf, moovKids);
  for (const t of traks) scrub(buf, children(buf, t));
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
