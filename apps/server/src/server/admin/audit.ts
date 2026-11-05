import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { pageWindow, toPage } from './paging';

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

/** P5.16 viewer: newest first, with the admin's username; 20 a page (D210). */
export async function listAudit(opts: { before?: Date; page?: number } = {}) {
  const page = opts.page ?? 1;
  const where = opts.before ? { createdAt: { lt: opts.before } } : {};
  const [rows, total] = await Promise.all([
    db.adminAuditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageWindow(page),
      include: { admin: { select: { username: true } } },
    }),
    db.adminAuditLog.count({ where }),
  ]);
  const entries = rows.map((r) => ({
    id: r.id,
    admin: r.admin.username,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    metadata: r.metadata,
    createdAt: r.createdAt.toISOString(),
  }));
  return toPage(entries, total, page);
}
