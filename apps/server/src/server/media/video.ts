import { randomBytes } from 'node:crypto';
import type { User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { enforce } from '../rate-limit';
import { cleanVideo } from './clean/video';
import { MediaRefused } from './clean/refused';
import { signedPhotoUrl } from './photos';
import { objectStore } from './store';

/** D102 video posts; the checks and cleaning are shared with the website (clean/video.ts). */
export async function processVideo(input: Buffer, maxSeconds: number) {
  try {
    return await cleanVideo(input, maxSeconds);
  } catch (err) {
    if (err instanceof MediaRefused) throw new ApiError(422, err.code, err.message);
    throw err;
  }
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
