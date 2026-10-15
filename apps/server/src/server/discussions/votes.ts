import { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { ApiError } from '../http';

export type VoteTarget =
  | { type: 'general'; id: string }
  | { type: 'business'; id: string }
  | { type: 'comment'; id: string };

const TABLE = {
  general: Prisma.raw('"GeneralPost"'),
  business: Prisma.raw('"BusinessPost"'),
  comment: Prisma.raw('"Comment"'),
} as const;
const COLUMN = {
  general: 'generalPostId',
  business: 'businessPostId',
  comment: 'commentId',
} as const;

export interface VoteResult {
  score: number;
  upCount: number;
  downCount: number;
  myVote: -1 | 0 | 1;
}

/**
 * P3.4 / D6: one vote per (voter, item). +1 / -1 sets or changes it, 0 removes it.
 * Totals are only ever changed here, by the difference between the old and new vote,
 * in the same transaction. A per-(voter, item) lock serializes double-taps, so the
 * counters can't drift. Clients never send totals (§8).
 */
export async function castVote(voterId: string, target: VoteTarget, value: -1 | 0 | 1) {
  return db.$transaction(async (tx): Promise<VoteResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${voterId + ':' + target.id}))`;

    const exists = await tx.$queryRaw<{ ok: boolean }[]>`
      SELECT true AS ok FROM ${TABLE[target.type]} WHERE id = ${target.id}::uuid AND status = 'VISIBLE'`;
    if (!exists[0]) throw new ApiError(404, 'NOT_FOUND', 'Not found');

    const where = { voterId, [COLUMN[target.type]]: target.id };
    const existing = await tx.vote.findFirst({ where, select: { id: true, value: true } });
    const old = existing?.value ?? 0;

    if (value !== old) {
      if (value === 0) await tx.vote.delete({ where: { id: existing!.id } });
      else if (existing) await tx.vote.update({ where: { id: existing.id }, data: { value } });
      else await tx.vote.create({ data: { ...where, value } });

      const up = (value === 1 ? 1 : 0) - (old === 1 ? 1 : 0);
      const down = (value === -1 ? 1 : 0) - (old === -1 ? 1 : 0);
      await tx.$executeRaw`
        UPDATE ${TABLE[target.type]}
        SET "upCount" = "upCount" + ${up}::int, "downCount" = "downCount" + ${down}::int,
            score = score + ${value - old}::int
        WHERE id = ${target.id}::uuid`;
    }
    const [t] = await tx.$queryRaw<{ score: number; upCount: number; downCount: number }[]>`
      SELECT score, "upCount", "downCount" FROM ${TABLE[target.type]} WHERE id = ${target.id}::uuid`;
    return { ...t!, myVote: value };
  });
}
