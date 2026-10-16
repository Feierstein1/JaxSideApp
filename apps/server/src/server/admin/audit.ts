import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';

/**
 * P5.16: every consequential admin action is written here (who, what, which target,
 * when, and a few details). Never edited or deleted from the portal.
 */
export async function audit(
  adminId: string,
  action: string,
  target: { type: string; id?: string | null },
  metadata?: Prisma.InputJsonValue,
  client: Prisma.TransactionClient = db,
) {
  await client.adminAuditLog.create({
    data: {
      adminId,
      action,
      targetType: target.type,
      targetId: target.id ?? null,
      ...(metadata === undefined ? {} : { metadata }),
    },
  });
}

/** P5.16 viewer: newest first, with the admin's username. */
export async function listAudit(opts: { before?: Date; limit?: number } = {}) {
  const rows = await db.adminAuditLog.findMany({
    where: opts.before ? { createdAt: { lt: opts.before } } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 100, 200),
    include: { admin: { select: { username: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    admin: r.admin.username,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    metadata: r.metadata,
    createdAt: r.createdAt.toISOString(),
  }));
}
