'use client';

import { useState, type CSSProperties } from 'react';
import {
  blankSession,
  COLORS,
  EVENT_CATEGORIES,
  EVENT_CHAT_RADIUS,
  EVENT_IMAGES_MAX,
  EVENT_SETTINGS,
  localDate,
  repeatWeekly,
  type EventCategory,
  type EventHostKind,
  type EventSetting,
  type SessionInput,
} from '@jax/shared';
import { adminFetch, csrfToken, ui } from './admin-ui';

/*
 * D230: the admin portal's event forms. The owner seeds the calendar with these before launch
 * (an admin's events are approved at once) and reviews everyone else's.
 */

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setError(undefined);
    setDone(undefined);
    try {
      setDone((await fn()) ?? 'Done.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, done, run };
}

function Feedback({ error, done }: { error?: string; done?: string }) {
  return (
    <>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
      {done ? <p role="status">{done}</p> : null}
    </>
  );
}

const textarea: CSSProperties = { ...ui.input, minHeight: 110, fontFamily: 'inherit' };
const row: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' };
const check: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  margin: '4px 0 12px',
};

export interface EventFormValues {
  hostKind: EventHostKind;
  title: string;
  description: string;
  category: EventCategory;
  setting: EventSetting;
  free: boolean;
  priceText: string | null;
  adultsOnly: boolean;
  familyFriendly: boolean;
  place: { id: string; name: string; address: string | null } | null;
  venueName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  chatRadiusMeters: number;
  sessions: SessionInput[];
}

const EMPTY: EventFormValues = {
  hostKind: 'community',
  title: '',
  description: '',
  category: 'community',
  setting: 'outdoor',
  free: true,
  priceText: null,
  adultsOnly: false,
  familyFriendly: false,
  place: null,
  venueName: null,
  address: null,
  latitude: null,
  longitude: null,
  chatRadiusMeters: EVENT_CHAT_RADIUS.default,
  sessions: [blankSession(localDate(new Date()))],
};

/** Add an event (no `id`) or change one. */
export function EventForm({ id, initial }: { id?: string; initial?: EventFormValues }) {
  const [v, setV] = useState<EventFormValues>(initial ?? EMPTY);
  const set = <K extends keyof EventFormValues>(k: K, value: EventFormValues[K]) =>
    setV((old) => ({ ...old, [k]: value }));
  const [pin, setPin] = useState(
    v.latitude !== null && v.longitude !== null && !v.place ? `${v.latitude}, ${v.longitude}` : '',
  );
  const [placeQuery, setPlaceQuery] = useState('');
  const [places, setPlaces] = useState<{ id: string; name: string; address: string | null }[]>([]);
  const [repeatUntil, setRepeatUntil] = useState('');
  const geo = useSubmit();
  const save = useSubmit();

  const findPlaces = () =>
    geo.run(async () => {
      const r = await adminFetch<{ places: typeof places }>(
        `/api/v1/admin/events/places?q=${encodeURIComponent(placeQuery)}`,
      );
      setPlaces(r.places);
      return r.places.length ? `${r.places.length} found. Pick one.` : 'No places match.';
    });
  const findAddress = () =>
    geo.run(async () => {
      const r = await adminFetch<{
        match: { latitude: number; longitude: number; matchedAddress: string } | null;
      }>('/api/v1/admin/events/geocode', { method: 'POST', body: { address: v.address ?? '' } });
      if (!r.match) throw new Error('Address not found. Check it, or paste a pin from a map.');
      setPin(`${r.match.latitude.toFixed(6)}, ${r.match.longitude.toFixed(6)}`);
      return `Found: ${r.match.matchedAddress}. Check the pin on a map if unsure.`;
    });

  const setSession = (i: number, patch: Partial<SessionInput>) =>
    set(
      'sessions',
      v.sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );
  const repeat = () => {
    const first = v.sessions[0];
    if (!first || !repeatUntil) return;
    set('sessions', repeatWeekly(first, repeatUntil));
  };

  const submit = () =>
    save.run(async () => {
      let latitude: number | undefined;
      let longitude: number | undefined;
      if (!v.place) {
        const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(pin);
        if (!m) throw new Error('Pick a place, or set the pin as "latitude, longitude".');
        latitude = Number(m[1]);
        longitude = Number(m[2]);
      }
      const body = {
        hostKind: v.hostKind,
        title: v.title,
        description: v.description,
        category: v.category,
        setting: v.setting,
        free: v.free,
        ...(!v.free && v.priceText?.trim() ? { priceText: v.priceText.trim() } : {}),
        adultsOnly: v.adultsOnly,
        familyFriendly: v.familyFriendly,
        ...(v.place ? { placeId: v.place.id } : { latitude, longitude }),
        ...(v.venueName?.trim() ? { venueName: v.venueName.trim() } : {}),
        ...(v.address?.trim() ? { address: v.address.trim() } : {}),
        chatRadiusMeters: v.chatRadiusMeters,
        sessions: v.sessions,
      };
      if (id) {
        await adminFetch(`/api/v1/admin/events/${id}`, { method: 'PATCH', body });
        return 'Saved.';
      }
      const r = await adminFetch<{ id: string }>('/api/v1/admin/events', { method: 'POST', body });
      window.location.href = `/admin/events/${r.id}?created=1`;
    });

  return (
    <div style={{ ...ui.card, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0 }}>{id ? 'Edit event' : 'Add an event'}</h2>
      <label style={ui.label}>
        Title
        <input
          style={ui.input}
          value={v.title}
          maxLength={100}
          onChange={(e) => set('title', e.target.value)}
        />
      </label>
      <div style={row}>
        <label style={{ ...ui.label, flex: 1, minWidth: 180 }}>
          Category
          <select
            style={ui.input}
            value={v.category}
            onChange={(e) => set('category', e.target.value as EventCategory)}
          >
            {Object.entries(EVENT_CATEGORIES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...ui.label, flex: 1, minWidth: 180 }}>
          Who puts it on
          <select
            style={ui.input}
            value={v.hostKind}
            onChange={(e) => set('hostKind', e.target.value as EventHostKind)}
          >
            <option value="community">Community (festival, city, neighborhood)</option>
            <option value="business">A business, at its place</option>
            <option value="organizer">An event organizer</option>
          </select>
        </label>
        <label style={{ ...ui.label, flex: 1, minWidth: 160 }}>
          Setting
          <select
            style={ui.input}
            value={v.setting}
            onChange={(e) => set('setting', e.target.value as EventSetting)}
          >
            {Object.entries(EVENT_SETTINGS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label style={ui.label}>
        Description
        <textarea
          style={textarea}
          value={v.description}
          maxLength={2000}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>
      <div style={row}>
        <label style={check}>
          <input type="checkbox" checked={v.free} onChange={(e) => set('free', e.target.checked)} />
          Free
        </label>
        {!v.free ? (
          <label style={{ ...ui.label, flex: 1, minWidth: 200 }}>
            Price (optional)
            <input
              style={ui.input}
              value={v.priceText ?? ''}
              maxLength={60}
              placeholder="$10, $15–25, Tickets at the door"
              onChange={(e) => set('priceText', e.target.value)}
            />
          </label>
        ) : null}
        <label style={check}>
          <input
            type="checkbox"
            checked={v.adultsOnly}
            onChange={(e) => set('adultsOnly', e.target.checked)}
          />
          21+
        </label>
        <label style={check}>
          <input
            type="checkbox"
            checked={v.familyFriendly}
            onChange={(e) => set('familyFriendly', e.target.checked)}
          />
          Family-friendly
        </label>
      </div>

      <h3>Where</h3>
      {v.place ? (
        <p>
          At <strong>{v.place.name}</strong>
          {v.place.address ? ` · ${v.place.address}` : ''}{' '}
          <button style={ui.buttonSecondary} onClick={() => set('place', null)}>
            Use an address instead
          </button>
        </p>
      ) : (
        <>
          <div style={row}>
            <label style={{ ...ui.label, flex: 1, minWidth: 240 }}>
              A place in the directory
              <input
                style={ui.input}
                value={placeQuery}
                placeholder="Place name"
                onChange={(e) => setPlaceQuery(e.target.value)}
              />
            </label>
            <button
              style={{ ...ui.buttonSecondary, marginBottom: 14 }}
              disabled={geo.busy || placeQuery.trim().length < 2}
              onClick={findPlaces}
            >
              Find place
            </button>
          </div>
          {places.length ? (
            <ul style={{ marginTop: 0 }}>
              {places.map((p) => (
                <li key={p.id}>
                  <button
                    style={{ ...ui.buttonSecondary, padding: '3px 10px', margin: '2px 0' }}
                    onClick={() => {
                      set('place', p);
                      setPlaces([]);
                    }}
                  >
                    {p.name}
                  </button>{' '}
                  {p.address ?? ''}
                </li>
              ))}
            </ul>
          ) : null}
          <p style={ui.muted}>Or an address with a pin (a park, a street, a festival ground):</p>
          <div style={row}>
            <label style={{ ...ui.label, flex: 2, minWidth: 260 }}>
              Address
              <input
                style={ui.input}
                value={v.address ?? ''}
                maxLength={300}
                placeholder="2600 Riverside Ave, Jacksonville FL 32204"
                onChange={(e) => set('address', e.target.value)}
              />
            </label>
            <button
              style={{ ...ui.buttonSecondary, marginBottom: 14 }}
              disabled={geo.busy || (v.address ?? '').trim().length < 5}
              onClick={findAddress}
            >
              Find pin
            </button>
          </div>
          <label style={ui.label}>
            Pin: latitude, longitude (in Google Maps, long-press the spot and copy the numbers)
            <input
              style={ui.input}
              value={pin}
              placeholder="30.3274, -81.6588"
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
        </>
      )}
      <Feedback error={geo.error} done={geo.done} />
      <div style={row}>
        <label style={{ ...ui.label, flex: 2, minWidth: 220 }}>
          Venue name (optional)
          <input
            style={ui.input}
            value={v.venueName ?? ''}
            maxLength={120}
            placeholder="Memorial Park, the Riverside Arts Market lot"
            onChange={(e) => set('venueName', e.target.value)}
          />
        </label>
        <label style={{ ...ui.label, flex: 1, minWidth: 160 }}>
          Chat area (meters around the pin)
          <input
            style={ui.input}
            type="number"
            min={EVENT_CHAT_RADIUS.min}
            max={EVENT_CHAT_RADIUS.max}
            value={v.chatRadiusMeters}
            onChange={(e) => set('chatRadiusMeters', Number(e.target.value))}
          />
        </label>
      </div>

      <h3>Dates and times (Jacksonville time)</h3>
      <p style={ui.muted}>One row per day. An end at or before the start runs past midnight.</p>
      {v.sessions.map((s, i) => (
        <div key={i} style={row}>
          <label style={ui.label}>
            Date
            <input
              style={ui.input}
              type="date"
              value={s.date}
              onChange={(e) => setSession(i, { date: e.target.value })}
            />
          </label>
          <label style={ui.label}>
            Starts
            <input
              style={ui.input}
              type="time"
              value={s.start}
              onChange={(e) => setSession(i, { start: e.target.value })}
            />
          </label>
          <label style={ui.label}>
            Ends
            <input
              style={ui.input}
              type="time"
              value={s.end}
              onChange={(e) => setSession(i, { end: e.target.value })}
            />
          </label>
          {v.sessions.length > 1 ? (
            <button
              style={{ ...ui.buttonSecondary, marginBottom: 14 }}
              onClick={() =>
                set(
                  'sessions',
                  v.sessions.filter((_, j) => j !== i),
                )
              }
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      <div style={row}>
        <button
          style={{ ...ui.buttonSecondary, marginBottom: 14 }}
          onClick={() => {
            const last = v.sessions[v.sessions.length - 1] ?? blankSession(localDate(new Date()));
            set('sessions', [...v.sessions, { ...last }]);
          }}
        >
          Add a date
        </button>
        <label style={ui.label}>
          Repeat the first date weekly until
          <input
            style={ui.input}
            type="date"
            value={repeatUntil}
            onChange={(e) => setRepeatUntil(e.target.value)}
          />
        </label>
        <button
          style={{ ...ui.buttonSecondary, marginBottom: 14 }}
          disabled={!repeatUntil}
          onClick={repeat}
        >
          Repeat weekly
        </button>
      </div>

      <button style={ui.button} disabled={save.busy || !v.title.trim()} onClick={submit}>
        {id ? 'Save changes' : 'Add event'}
      </button>
      <Feedback error={save.error} done={save.done} />
    </div>
  );
}

/** Approve, deny, cancel, remove or restore, depending on where the event stands. */
export function EventDecision({ id, status }: { id: string; status: string }) {
  const [reason, setReason] = useState('');
  const { busy, error, done, run } = useSubmit();
  const decide = (action: string, needsReason = false) =>
    run(async () => {
      if (needsReason && reason.trim().length < 3) throw new Error('Give a short reason first.');
      await adminFetch(`/api/v1/admin/events/${id}/decide`, {
        method: 'POST',
        body: needsReason ? { action, reason } : { action },
      });
      window.location.reload();
    });
  const waiting = status === 'SUGGESTED' || status === 'IN_REVIEW';
  return (
    <div style={{ ...ui.card, maxWidth: 760, marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Review</h2>
      <label style={ui.label}>
        Reason (needed to deny, cancel or remove; a denied business sees it)
        <input
          style={ui.input}
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div style={{ ...row, gap: 8 }}>
        {waiting || status === 'DENIED' ? (
          <button style={ui.button} disabled={busy} onClick={() => decide('approve')}>
            Approve
          </button>
        ) : null}
        {waiting ? (
          <button style={ui.buttonSecondary} disabled={busy} onClick={() => decide('deny', true)}>
            Deny
          </button>
        ) : null}
        {status === 'APPROVED' ? (
          <button
            style={ui.buttonSecondary}
            disabled={busy}
            onClick={() => {
              if (confirm('Cancel this event? Everyone following it is told.')) {
                void decide('cancel', true);
              }
            }}
          >
            Cancel event
          </button>
        ) : null}
        {status === 'CANCELLED' || status === 'REMOVED' ? (
          <button style={ui.buttonSecondary} disabled={busy} onClick={() => decide('restore')}>
            Restore
          </button>
        ) : null}
        {status !== 'REMOVED' ? (
          <button style={ui.buttonDanger} disabled={busy} onClick={() => decide('remove', true)}>
            Remove
          </button>
        ) : null}
      </div>
      <Feedback error={error} done={done} />
    </div>
  );
}

/** Duplicate (same dates, to edit) or Repeat yearly; the copy waits in review. */
export function EventCopyButtons({ id }: { id: string }) {
  const { busy, error, done, run } = useSubmit();
  const copy = (years: number) =>
    run(async () => {
      const r = await adminFetch<{ id: string }>(`/api/v1/admin/events/${id}/copy`, {
        method: 'POST',
        body: { years },
      });
      window.location.href = `/admin/events/${r.id}`;
    });
  return (
    <div style={{ ...row, gap: 8, margin: '12px 0' }}>
      <button style={ui.buttonSecondary} disabled={busy} onClick={() => copy(0)}>
        Duplicate
      </button>
      <button style={ui.buttonSecondary} disabled={busy} onClick={() => copy(1)}>
        Repeat yearly
      </button>
      <span style={ui.muted}>The copy waits under Waiting until you approve it.</span>
      <Feedback error={error} done={done} />
    </div>
  );
}

/** The event's pictures: add (cleaned on the server) and remove. */
export function EventImages({ id, images }: { id: string; images: { id: string; url: string }[] }) {
  const { busy, error, done, run } = useSubmit();
  const upload = (file: File) =>
    run(async () => {
      const res = await fetch(`/api/v1/admin/events/${id}/images`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-CSRF-Token': csrfToken(),
        },
        body: file,
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message ?? `Upload failed (${res.status})`);
      window.location.reload();
    });
  const remove = (imageId: string) =>
    run(async () => {
      await adminFetch(`/api/v1/admin/events/${id}/images/${imageId}`, { method: 'DELETE' });
      window.location.reload();
    });
  return (
    <div style={{ ...ui.card, maxWidth: 760, marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Pictures</h2>
      <p style={ui.muted}>
        Up to {EVENT_IMAGES_MAX}. The first one shows on the event’s card. Real photos or the
        organizer’s own flyer; no AI-made pictures (D207).
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {images.map((img) => (
          <div key={img.id} style={{ textAlign: 'center' }}>
            <img
              src={img.url}
              alt=""
              style={{
                width: 160,
                height: 120,
                objectFit: 'cover',
                borderRadius: 8,
                border: `1px solid ${COLORS.cardBorder}`,
              }}
            />
            <div>
              <button
                style={{ ...ui.buttonSecondary, padding: '3px 10px', marginTop: 4 }}
                disabled={busy}
                onClick={() => remove(img.id)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      {images.length < EVENT_IMAGES_MAX ? (
        <label style={{ ...ui.label, display: 'block', marginTop: 12 }}>
          Add a picture
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            style={{ display: 'block', marginTop: 6 }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
      ) : null}
      <Feedback error={error} done={done} />
    </div>
  );
}

/** D230: approve an event organizer, turn one down, or take back an approval. */
export function OrganizerDecision({ accountId, status }: { accountId: string; status: string }) {
  const [note, setNote] = useState('');
  const { busy, error, done, run } = useSubmit();
  const decide = (action: 'approve' | 'reject' | 'revoke') =>
    run(async () => {
      if (action !== 'approve' && note.trim().length < 3) {
        throw new Error('Write a short note first (the organizer sees it).');
      }
      await adminFetch(`/api/v1/admin/organizers/${accountId}`, {
        method: 'POST',
        body: action === 'approve' ? { action } : { action, note },
      });
      window.location.reload();
    });
  return (
    <div style={{ minWidth: 220 }}>
      <input
        style={{ ...ui.input, margin: '0 0 6px' }}
        value={note}
        maxLength={500}
        placeholder={status === 'VERIFIED' ? 'Note (to take back)' : 'Note (to reject)'}
        aria-label="Note"
        onChange={(e) => setNote(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {status !== 'VERIFIED' ? (
          <button style={ui.button} disabled={busy} onClick={() => decide('approve')}>
            Approve
          </button>
        ) : null}
        {status === 'PENDING' ? (
          <button style={ui.buttonSecondary} disabled={busy} onClick={() => decide('reject')}>
            Reject
          </button>
        ) : null}
        {status === 'VERIFIED' ? (
          <button style={ui.buttonDanger} disabled={busy} onClick={() => decide('revoke')}>
            Take back
          </button>
        ) : null}
      </div>
      <Feedback error={error} done={done} />
    </div>
  );
}
