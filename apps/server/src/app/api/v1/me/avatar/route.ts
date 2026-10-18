import { NextResponse } from 'next/server';
import { avatarSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { db } from '@/server/db';
import { ApiError, route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

const limit = (userId: string) =>
  enforce([
    { key: `profile:user:${userId}`, limitKey: 'rateLimit.profile.perMinute', windowSeconds: 60 },
  ]);

/** P6.5: set your profile photo to one you uploaded (same pipeline as post photos). */
export const PUT = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const { photoId } = await parseBody(req, avatarSchema);
  await limit(user.id);
  const photo = await db.photo.findFirst({
    where: {
      id: photoId,
      uploaderId: user.id,
      kind: 'IMAGE', // D75: a voice clip can't be a profile picture
      status: 'ACTIVE',
      generalPostId: null,
      businessPostId: null,
    },
  });
  if (!photo) throw new ApiError(400, 'INVALID_PHOTO', 'That photo can’t be used.');
  await db.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, avatarPhotoId: photo.id },
    update: { avatarPhotoId: photo.id },
  });
  return NextResponse.json({ ok: true });
});

/** Remove your profile photo. */
export const DELETE = route(async (req) => {
  const { user } = await requireUser(req);
  await limit(user.id);
  await db.profile.updateMany({ where: { userId: user.id }, data: { avatarPhotoId: null } });
  return NextResponse.json({ ok: true });
});
