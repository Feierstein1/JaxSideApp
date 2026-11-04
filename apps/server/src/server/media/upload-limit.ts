import { ApiError } from '../http';
import { enforce, waitText } from '../rate-limit';

/** D198: each kind of upload has its own daily cap (photos 30, voice clips 15, videos 5). */
const KINDS = {
  photo: { limitKey: 'rateLimit.upload.photosPerDay', noun: 'photos' },
  voice: { limitKey: 'rateLimit.upload.voicePerDay', noun: 'voice recordings' },
  video: { limitKey: 'rateLimit.upload.videosPerDay', noun: 'videos' },
} as const;

export type UploadKind = keyof typeof KINDS;

/**
 * Counts one upload against the person's daily cap for that kind. Over the cap it throws a 429
 * with the code UPLOAD_LIMIT, which the app shows as a pop-up explaining why and when they can
 * upload again.
 */
export async function enforceUploadLimit(userId: string, kind: UploadKind, now = new Date()) {
  const { limitKey, noun } = KINDS[kind];
  try {
    await enforce([{ key: `upload-day:${kind}:user:${userId}`, limitKey, windowSeconds: 86_400 }], now);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
      const wait = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      throw new ApiError(
        429,
        'UPLOAD_LIMIT',
        `You’ve reached today’s limit for ${noun}. This keeps spam out of JaxSide. You can upload ${noun} again tomorrow${wait ? ` (in about ${waitText(wait)})` : ''}.`,
        { retryAfterSeconds: wait, kind },
      );
    }
    throw err;
  }
}
