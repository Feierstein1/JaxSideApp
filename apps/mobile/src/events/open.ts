import { router } from 'expo-router';

/**
 * D259: open an event from outside the Events tab (the Home reminder, an ad, a bell
 * notification). Pushing straight to the event left it as the only screen in that tab, so the
 * back arrow had nowhere to go. This puts the Events page underneath first, so back lands there.
 * Inside the Events tab itself, push as usual.
 */
export function openEvent(id: string) {
  router.navigate('/events');
  setTimeout(() => router.push(`/events/event/${id}`), 0);
}

/** The same for a place opened from another tab (an ad on Home), so back lands on Places. */
export function openPlace(id: string) {
  router.navigate('/places');
  setTimeout(() => router.push(`/places/${id}`), 0);
}
