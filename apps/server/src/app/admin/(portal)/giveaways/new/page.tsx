import { GiveawayForm } from '../../../giveaway-forms';
import { requireAdminPage } from '../../../require-admin-page';

export const dynamic = 'force-dynamic';

/** D188: a new giveaway with its criteria. */
export default async function NewGiveawayPage() {
  await requireAdminPage();
  return (
    <>
      <a href="/admin/giveaways">← Giveaways</a>
      <h1 style={{ marginTop: 12 }}>New giveaway</h1>
      <GiveawayForm />
    </>
  );
}
