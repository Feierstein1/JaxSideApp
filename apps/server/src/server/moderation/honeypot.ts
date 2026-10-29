import { revokeAllSessions } from '../auth/sessions';
import { db } from '../db';

/**
 * D160: the sign-up form and the email-confirmation screen each carry a checkbox no person
 * can see or reach (hidden from screen readers too). Only a bot filling in every field ticks
 * it. When one does, the account is banned on the spot, with its app installation, and an
 * automatic report puts it in the moderators' queue so the admin sees it happened.
 */
export type TrapPlace = 'sign-up' | 'email confirmation';

export async function springTrap(
  userId: string,
  where: TrapPlace,
  installationId: string | null = null,
  now = new Date(),
) {
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { status: 'BANNED', suspendedUntil: null },
    });
    const sessions = await tx.session.findMany({
      where: { userId, installationId: { not: null } },
      select: { installationId: true },
      distinct: ['installationId'],
    });
    const ids = [...new Set([installationId, ...sessions.map((s) => s.installationId)])].filter(
      (id): id is string => !!id,
    );
    await tx.installation.updateMany({
      where: { id: { in: ids }, bannedAt: null },
      data: { bannedAt: now },
    });
    await tx.report.create({
      data: {
        reportedUserId: userId,
        reason: 'SPAM',
        details: `Bot trap: the hidden checkbox was ticked at ${where}. The account was banned automatically.`,
      },
    });
  });
  await revokeAllSessions(userId);
}
