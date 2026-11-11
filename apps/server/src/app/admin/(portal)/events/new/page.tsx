import { EventForm } from '../../../event-forms';
import { requireAdminPage } from '../../../require-admin-page';

export const dynamic = 'force-dynamic';

/** D230: add an event. It's approved at once; pictures are added on the next page. */
export default async function NewEventPage() {
  await requireAdminPage();
  return (
    <>
      <p>
        <a href="/admin/events">← Events</a>
      </p>
      <h1>Add an event</h1>
      <EventForm />
    </>
  );
}
