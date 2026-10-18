import { ApiError } from '../http';

/** Reads the request body but stops as soon as it passes `max` bytes. */
export async function readCapped(req: Request, max: number, what = 'Photos'): Promise<Buffer> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  const tooBig = () =>
    new ApiError(413, 'TOO_LARGE', `${what} can be up to ${max / 1024 / 1024} MB.`);
  if (declared > max) throw tooBig();
  if (!req.body) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a photo');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw tooBig();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
