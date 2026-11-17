import { db } from '../db';
import { objectStore } from '../media/store';

/**
 * D263 (hub): business pictures nobody uses any more are deleted, with their files. They pile up
 * when an owner switches an ad between shapes (each switch makes a fitted copy) or abandons an
 * upload. Kept while any ad (any status) points at it, while it's a login's profile picture or a
 * business's default event picture, and for a day after it was made (an upload in progress).
 * Event pictures are separate (`EventImage`, deleted with their event).
 */
export async function purgeUnusedAdMedia(now = new Date()) {
  const stale = await db.adMedia.findMany({
    where: {
      createdAt: { lt: new Date(now.getTime() - 86_400_000) },
      ads: { none: {} },
      avatarOf: null,
      defaultEventOf: { none: {} },
    },
    select: { id: true, storageKey: true, quarantineKey: true },
    take: 500,
  });
  for (const m of stale) {
    for (const key of [m.storageKey, m.quarantineKey]) {
      if (key)
        await objectStore()
          .delete(key)
          .catch(() => undefined);
    }
  }
  // Checked again in the delete, in case something started using one meanwhile.
  const r = await db.adMedia.deleteMany({
    where: {
      id: { in: stale.map((m) => m.id) },
      ads: { none: {} },
      avatarOf: null,
      defaultEventOf: { none: {} },
    },
  });
  return r.count;
}
