import { db } from '../db';

/** P5.11: the dashboard's counts of work waiting. */
export async function adminSummary() {
  const [openReports, held, openAppeals, pendingSubmissions] = await Promise.all([
    db.report.count({ where: { status: 'OPEN' } }),
    Promise.all([
      db.generalPost.count({ where: { status: 'HELD_FOR_REVIEW' } }),
      db.businessPost.count({ where: { status: 'HELD_FOR_REVIEW' } }),
      db.comment.count({ where: { status: 'HELD_FOR_REVIEW' } }),
    ]).then((n) => n.reduce((a, b) => a + b, 0)),
    db.appeal.count({ where: { status: 'OPEN' } }),
    db.businessSubmission.count({ where: { status: 'PENDING' } }),
  ]);
  return { openReports, held, openAppeals, pendingSubmissions };
}
