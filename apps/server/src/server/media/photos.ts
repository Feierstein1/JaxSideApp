import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma, User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { getEnv } from '../env';
import { ApiError } from '../http';
import { enforceUploadLimit } from './upload-limit';
import { imageClassifier } from './classifier';
import { cleanImage } from './clean/image';
import { MediaRefused } from './clean/refused';
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

const LINK_TTL_SECONDS = 3600;

export { sniffImage, type ImageKind } from './clean/image';

/** D195: the shared cleaning (clean/image.ts), with its refusal as the API's 422. */
export async function processImage(buf: Buffer) {
  try {
    return await cleanImage(buf);
  } catch (err) {
    if (err instanceof MediaRefused) throw new ApiError(422, err.code, err.message);
    throw err;
  }
}

export async function uploadPhoto(user: User, body: Buffer, now = new Date()) {
  const maxBytes = (await getConfig('photos.maxUploadMB')) * 1024 * 1024;
  if (body.length > maxBytes) {
    throw new ApiError(413, 'TOO_LARGE', `Photos can be up to ${maxBytes / 1024 / 1024} MB.`);
  }
  await enforceUploadLimit(user.id, 'photo', now);
  const clean = await processImage(body);
  // P6.6: optional automated screening (none configured by default). Until a review
  // flow for held photos exists, "hold" is treated like "block".
  const verdict = await imageClassifier().classify(clean.data);
  if (verdict.action !== 'allow')
    throw new ApiError(422, 'INVALID_IMAGE', 'This photo can’t be posted.');

  const ext = clean.mimeType === 'image/gif' ? 'gif' : 'jpg';
  const storageKey = `photos/${randomBytes(24).toString('hex')}.${ext}`;
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
      kind: 'IMAGE', // D75: a voice clip isn't a photo
      status: 'ACTIVE',
      generalPostId: null,
      businessPostId: null,
      messageId: null, // D98: not one already sent in a message
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

/** D75: attaches the uploader's own unattached voice clip to a new post. */
export async function attachVoice(
  tx: Prisma.TransactionClient,
  userId: string,
  voiceId: string | undefined,
  target: { generalPostId: string } | { businessPostId: string },
  kind: 'AUDIO' | 'VIDEO' = 'AUDIO',
) {
  if (!voiceId) return;
  const res = await tx.photo.updateMany({
    where: {
      id: voiceId,
      uploaderId: userId,
      kind,
      messageId: null,
      status: 'ACTIVE',
      generalPostId: null,
      businessPostId: null,
    },
    data: target,
  });
  if (res.count !== 1) {
    throw kind === 'VIDEO'
      ? new ApiError(400, 'INVALID_VIDEO', 'That video can’t be used. Try adding it again.')
      : new ApiError(400, 'INVALID_VOICE', 'That recording can’t be used. Try recording again.');
  }
}

/** D102: attaches the uploader's own unattached video to a new post. */
export const attachVideo = (
  tx: Prisma.TransactionClient,
  userId: string,
  videoId: string | undefined,
  target: { generalPostId: string } | { businessPostId: string },
) => attachVoice(tx, userId, videoId, target, 'VIDEO');

// ───────────────────────────── Signed links ─────────────────────────────

/** `kind` keeps a photo link from opening a business picture with the same ID, and back. */
function sig(id: string, exp: number, kind: 'photo' | 'business-picture' = 'photo') {
  return createHmac('sha256', getEnv().SESSION_SECRET)
    .update(`${kind}:${id}:${exp}`)
    .digest('base64url');
}

/** A link that works for an hour (relative; the app prefixes its server address). */
export function signedPhotoUrl(id: string, now = new Date()) {
  // Round the expiry so the same photo gets the same link for a while (image caching).
  const exp = Math.ceil(now.getTime() / 1000 / 600) * 600 + LINK_TTL_SECONDS;
  return `/api/v1/photos/${id}?exp=${exp}&sig=${sig(id, exp)}`;
}

/** D189: a business login's profile picture, the same way (works for an hour). */
export function signedBusinessPictureUrl(id: string, now = new Date()) {
  const exp = Math.ceil(now.getTime() / 1000 / 600) * 600 + LINK_TTL_SECONDS;
  return `/api/v1/business-pictures/${id}?exp=${exp}&sig=${sig(id, exp, 'business-picture')}`;
}

export function checkSignature(
  id: string,
  exp: string | null,
  given: string | null,
  now = new Date(),
  kind: 'photo' | 'business-picture' = 'photo',
) {
  const e = Number(exp);
  if (!Number.isInteger(e) || e < now.getTime() / 1000 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(sig(id, e, kind));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** D189: bytes for a business login's live profile picture, or null. */
export async function readBusinessPicture(id: string) {
  const m = await db.adMedia.findUnique({
    where: { id },
    include: { avatarOf: { select: { revokedAt: true } } },
  });
  if (!m || m.status !== 'ACTIVE' || !m.storageKey) return null;
  // Only while it's a login's picture and that login isn't revoked.
  if (!m.avatarOf || m.avatarOf.revokedAt) return null;
  const body = await objectStore().get(m.storageKey);
  return body ? { body, mimeType: m.mimeType ?? 'image/jpeg' } : null;
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
      messageId: null, // D98: photos sent in messages are attached
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
