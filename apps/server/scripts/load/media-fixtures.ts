/**
 * P15.12: realistic upload bodies for the daily stress test. Photos are real JPEGs at the
 * size the app sends (longest side 2048, quality 0.8); voice clips and videos are MP4 files
 * built box by box like the server tests do, padded to what a phone records per second.
 */
import sharp from 'sharp';

/** The app shrinks photos to this before upload (apps/mobile/src/discussion/photo-size.ts). */
const PHOTO_SIDE = 2048;
/** AAC voice at about 64 kbit/s; phone video at about 1.5 Mbit/s after the picker's export. */
const VOICE_BYTES_PER_SECOND = 8_000;
const VIDEO_BYTES_PER_SECOND = 190_000;

/** A few different photos (a soft noise texture compresses like a busy phone photo). */
export async function makePhotos(count = 6): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    const landscape = i % 2 === 0;
    out.push(
      await sharp({
        create: {
          width: landscape ? PHOTO_SIDE : 1536,
          height: landscape ? 1536 : PHOTO_SIDE,
          channels: 3,
          background: { r: 40 + i * 30, g: 90, b: 140 },
          noise: { type: 'gaussian', mean: 120 + i * 5, sigma: 40 },
        },
      })
        .blur(1.4)
        .jpeg({ quality: 80 })
        .toBuffer(),
    );
  }
  return out;
}

const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const box = (type: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]);
};
const mvhd = (ms: number) => {
  const b = Buffer.alloc(100);
  b.writeUInt32BE(1000, 12); // timescale: 1000 per second
  b.writeUInt32BE(ms, 16); // duration
  return box('mvhd', b);
};
const hdlr = (t: string) => {
  const b = Buffer.alloc(24);
  b.write(t, 8, 'latin1');
  return box('hdlr', b);
};

/** A voice clip of `seconds` (an .m4a with one sound track). */
export function makeVoice(seconds: number): Buffer {
  const trak = box('trak', box('mdia', hdlr('soun')));
  return Buffer.concat([
    box('ftyp', Buffer.from('M4A '), u32(0), Buffer.from('M4A isom')),
    box('moov', mvhd(seconds * 1000), trak),
    box('mdat', Buffer.alloc(seconds * VOICE_BYTES_PER_SECOND, 7)),
  ]);
}

/** A portrait phone video of `seconds` with a picture and a sound track. */
export function makeVideo(seconds: number): Buffer {
  const tkhd = (w: number, h: number) => {
    const b = Buffer.alloc(84);
    b.writeUInt32BE(w * 65536, 76);
    b.writeUInt32BE(h * 65536, 80);
    return box('tkhd', b);
  };
  const stbl = (offset: number, size: number) =>
    box(
      'stbl',
      box('stsz', u32(0), u32(0), u32(1), u32(size)),
      box('stsc', u32(0), u32(1), u32(1), u32(1), u32(1)),
      box('stco', u32(0), u32(1), u32(offset)),
    );
  const trak = (type: string, offset: number, size: number, w = 0, h = 0) =>
    box('trak', tkhd(w, h), box('mdia', hdlr(type), box('minf', stbl(offset, size))));
  const picture = Buffer.alloc(seconds * VIDEO_BYTES_PER_SECOND, 0x42);
  const sound = Buffer.alloc(seconds * 16_000, 0x11);
  const ftyp = box('ftyp', Buffer.from('qt  '), u32(0), Buffer.from('qt  '));
  const build = (mdatStart: number) => {
    const at = mdatStart + 8;
    const moov = box(
      'moov',
      mvhd(seconds * 1000),
      trak('vide', at, picture.length, 1080, 1920),
      trak('soun', at + picture.length, sound.length),
    );
    return { moov, mdat: box('mdat', picture, sound) };
  };
  const first = build(0);
  const { moov, mdat } = build(ftyp.length + first.moov.length);
  return Buffer.concat([ftyp, moov, mdat]);
}
