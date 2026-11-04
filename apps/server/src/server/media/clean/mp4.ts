/**
 * D195: shared with the owner website (see refused.ts); keep it self-contained.
 *
 * Reading MP4 / QuickTime files box by box (D75 voice, D102 video). Without a transcoder
 * the server checks uploads structurally and wipes metadata in place: boxes are zeroed and
 * renamed to `free` (which players skip), so sizes and offsets never move and the media
 * plays exactly as recorded.
 */

export interface Box {
  type: string;
  start: number;
  size: number;
  header: number;
}

export type Fail = (msg?: string) => Error;

export function boxes(buf: Buffer, start: number, end: number, bad: Fail): Box[] {
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

export const children = (buf: Buffer, b: Box, bad: Fail) =>
  boxes(buf, b.start + b.header, b.start + b.size, bad);
export const only = (list: Box[], type: string) => list.filter((b) => b.type === type);

/** Zeroes a box's contents and renames it `free`. */
export function blank(buf: Buffer, b: Box) {
  buf.write('free', b.start + 4, 'latin1');
  buf.fill(0, b.start + b.header, b.start + b.size);
}

const METADATA = new Set(['udta', 'meta', 'uuid']);

/** Blanks the metadata boxes (where a recorder puts a location or device name) in a list. */
export function scrubMetadata(buf: Buffer, list: Box[]) {
  for (const b of list) if (METADATA.has(b.type)) blank(buf, b);
}

/** Length in ms from the movie header (`mvhd`, version 0 or 1). */
export function durationMs(buf: Buffer, mvhd: Box, bad: Fail): number {
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

/** The handler type of a track (`soun` audio, `vide` video, `meta`/`mebx` metadata…). */
export function handler(buf: Buffer, trak: Box, bad: Fail): string {
  const mdia = only(children(buf, trak, bad), 'mdia')[0];
  const hdlr = mdia && only(children(buf, mdia, bad), 'hdlr')[0];
  if (!hdlr || hdlr.size < hdlr.header + 12) throw bad();
  return buf.toString('latin1', hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12);
}

/** A track's sample table (`moov/trak/mdia/minf/stbl`). */
function sampleTable(buf: Buffer, trak: Box, bad: Fail): Box[] | null {
  const mdia = only(children(buf, trak, bad), 'mdia')[0];
  const minf = mdia && only(children(buf, mdia, bad), 'minf')[0];
  const stbl = minf && only(children(buf, minf, bad), 'stbl')[0];
  return stbl ? children(buf, stbl, bad) : null;
}

/**
 * Zeroes every sample of a track in the media data, using its sample table: chunk offsets
 * (`stco`/`co64`), samples per chunk (`stsc`) and sample sizes (`stsz`). Used to remove
 * timed metadata tracks (e.g. an iPhone's), whose samples could carry location details.
 */
export function zeroTrackSamples(buf: Buffer, trak: Box, bad: Fail) {
  const stbl = sampleTable(buf, trak, bad);
  if (!stbl) return;
  const body = (b: Box | undefined) => (b ? b.start + b.header : -1);
  const stsz = only(stbl, 'stsz')[0];
  const stsc = only(stbl, 'stsc')[0];
  const stco = only(stbl, 'stco')[0] ?? only(stbl, 'co64')[0];
  if (!stsz || !stsc || !stco) return;
  // Chunk offsets.
  const co = body(stco);
  const chunkCount = buf.readUInt32BE(co + 4);
  const wide = stco.type === 'co64';
  const offsets: number[] = [];
  for (let i = 0; i < chunkCount; i++) {
    offsets.push(
      wide ? Number(buf.readBigUInt64BE(co + 8 + i * 8)) : buf.readUInt32BE(co + 8 + i * 4),
    );
  }
  // Sample sizes.
  const sz = body(stsz);
  const fixed = buf.readUInt32BE(sz + 4);
  const sampleCount = buf.readUInt32BE(sz + 8);
  const sizeOf = (i: number) => (fixed ? fixed : buf.readUInt32BE(sz + 12 + i * 4));
  // Samples per chunk (runs of chunks).
  const sc = body(stsc);
  const runs = buf.readUInt32BE(sc + 4);
  const perChunk: { first: number; samples: number }[] = [];
  for (let i = 0; i < runs; i++) {
    perChunk.push({
      first: buf.readUInt32BE(sc + 8 + i * 12),
      samples: buf.readUInt32BE(sc + 12 + i * 12),
    });
  }
  let sample = 0;
  for (let chunk = 1; chunk <= offsets.length && sample < sampleCount; chunk++) {
    let samples = 0;
    for (const r of perChunk) if (r.first <= chunk) samples = r.samples;
    let pos = offsets[chunk - 1]!;
    for (let k = 0; k < samples && sample < sampleCount; k++, sample++) {
      const len = sizeOf(sample);
      if (pos >= 0 && pos + len <= buf.length) buf.fill(0, pos, pos + len);
      pos += len;
    }
  }
}

/** Width and height (pixels) from a track header (`tkhd`, fixed-point 16.16 at its end). */
export function trackSize(buf: Buffer, trak: Box, bad: Fail): { width: number; height: number } {
  const tkhd = only(children(buf, trak, bad), 'tkhd')[0];
  if (!tkhd || tkhd.size < tkhd.header + 84) return { width: 0, height: 0 };
  const end = tkhd.start + tkhd.size;
  return {
    width: Math.round(buf.readUInt32BE(end - 8) / 65536),
    height: Math.round(buf.readUInt32BE(end - 4) / 65536),
  };
}
