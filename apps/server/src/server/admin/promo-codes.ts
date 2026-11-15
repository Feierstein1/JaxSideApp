import { adminPromoCodeSchema, type AdminPromoCodeInput } from '@jax/shared';
import { db } from '../db';
import { ApiError } from '../http';

/*
 * D248: promo codes for businesses (Kenny's first: 2 months of Standard, the first 50). An admin
 * makes them here; businesses use them on the website ("Have a code?"), one code per account.
 */

export async function listPromoCodes() {
  const codes = await db.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      plan: { select: { code: true, name: true } },
      redemptions: {
        orderBy: { redeemedAt: 'desc' },
        take: 200,
        include: { account: { select: { id: true, email: true } } },
      },
    },
  });
  return codes.map((c) => ({
    id: c.id,
    code: c.code,
    plan: c.plan.name,
    days: c.days,
    maxUses: c.maxUses,
    uses: c.uses,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    active: c.active,
    note: c.note,
    createdAt: c.createdAt.toISOString(),
    redemptions: c.redemptions.map((r) => ({
      accountId: r.account.id,
      email: r.account.email,
      redeemedAt: r.redeemedAt.toISOString(),
    })),
  }));
}

export async function createPromoCode(adminId: string, raw: AdminPromoCodeInput) {
  const input = adminPromoCodeSchema.parse(raw);
  const plan = await db.plan.findUnique({ where: { code: input.plan }, select: { id: true } });
  if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', 'That plan doesn’t exist yet.');
  if (await db.promoCode.count({ where: { code: input.code } })) {
    throw new ApiError(409, 'CODE_TAKEN', 'There’s already a code with that name.');
  }
  return db.promoCode.create({
    data: {
      code: input.code,
      planId: plan.id,
      days: input.days,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      note: input.note ?? null,
      createdById: adminId,
    },
  });
}

export async function setPromoActive(id: string, active: boolean) {
  const r = await db.promoCode.updateMany({ where: { id }, data: { active } });
  if (!r.count) throw new ApiError(404, 'NOT_FOUND', 'Code not found');
}
