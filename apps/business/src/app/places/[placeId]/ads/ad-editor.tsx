'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';
import {
  AD_TEMPLATES,
  COLORS,
  adSubmitProblems,
  type AdDraft,
  type AdTemplateKind,
} from '@jax/shared';
import { TEXT } from '@/text';
import { AdPreview, PhoneFrame } from '../../../ads/ad-preview';
import { post } from '../../../client';
import { ui } from '../../../ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RADII = [
  { label: '¼ mile', meters: 400 },
  { label: '½ mile', meters: 800 },
  { label: '1 mile', meters: 1600 },
  { label: '2 miles', meters: 3200 },
  { label: '5 miles', meters: 8000 },
];

/** "2026-07-05T16:00" (the browser's local time, Jacksonville) ↔ ISO. */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const toTime = (m: number | null) =>
  m === null
    ? ''
    : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTime = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h === undefined || m === undefined ? null : h * 60 + m;
};

export type EditorAd = AdDraft & { id?: string; mediaUrl: string | null; status?: string };

/**
 * B3.2: the ad editor with a live preview (D177). The checks shown here are the same
 * shared rules the server runs again when it saves or sends the ad.
 */
export function AdEditor({
  initial,
  placeName,
  owner,
}: {
  initial: EditorAd;
  placeName: string;
  owner: boolean;
}) {
  const router = useRouter();
  const [ad, setAd] = useState<EditorAd>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const t = AD_TEMPLATES[ad.template];
  const set = <K extends keyof EditorAd>(k: K, v: EditorAd[K]) => {
    setAd((a) => ({ ...a, [k]: v }));
    setSaved(undefined);
  };
  const problems = adSubmitProblems(ad, new Date());
  const allDay = ad.dailyStartMin === null;

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const csrf = document.cookie
        .split('; ')
        .find((c) => c.startsWith('jax_biz_csrf='))
        ?.slice('jax_biz_csrf='.length);
      const res = await fetch(`/api/places/${ad.placeId}/ads/media?template=${ad.template}`, {
        method: 'POST',
        headers: { 'x-csrf-token': decodeURIComponent(csrf ?? '') },
        body: file,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message ?? TEXT.common.failed);
      setAd((a) => ({ ...a, mediaId: json.id, mediaUrl: `/api/ads/media/${json.id}` }));
    } catch (err) {
      setError(err instanceof Error ? err.message : TEXT.common.failed);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function save(andSubmit: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      const { id, mediaUrl: _url, status: _status, ...draft } = ad;
      void _url;
      void _status;
      const r = await post<{ ad: { id: string; status: string } }>(
        id ? `/api/ads/${id}` : '/api/ads',
        draft,
      );
      if (andSubmit && r.ad.status === 'DRAFT') await post(`/api/ads/${r.ad.id}/submit`, {});
      if (!id) {
        router.replace(`/places/${ad.placeId}/ads/${r.ad.id}`);
        return;
      }
      setSaved(andSubmit ? TEXT.ads.sent : TEXT.ads.savedNote);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : TEXT.common.failed);
    } finally {
      setBusy(false);
    }
  }

  const label = { ...ui.label, fontWeight: 600 } as const;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
        gap: 32,
        alignItems: 'start',
      }}
    >
      <div>
        <label style={label}>
          {TEXT.ads.template}
          <select
            style={ui.input}
            value={ad.template}
            onChange={(e) => {
              // A picture fits one shape only: changing the template clears it.
              setAd((a) => ({
                ...a,
                template: e.target.value as AdTemplateKind,
                mediaId: null,
                mediaUrl: null,
              }));
            }}
          >
            {(Object.keys(AD_TEMPLATES) as AdTemplateKind[]).map((k) => (
              <option key={k} value={k}>
                {AD_TEMPLATES[k].label}: {AD_TEMPLATES[k].where}
              </option>
            ))}
          </select>
        </label>

        <label style={label}>
          {TEXT.ads.headline} ({ad.headline.length}/{t.headlineMax})
          <input
            style={ui.input}
            value={ad.headline}
            maxLength={t.headlineMax}
            onChange={(e) => set('headline', e.target.value)}
          />
        </label>
        {t.bodyMax > 0 ? (
          <label style={label}>
            {TEXT.ads.text} ({(ad.body ?? '').length}/{t.bodyMax})
            <textarea
              style={{ ...ui.input, minHeight: 80 }}
              value={ad.body ?? ''}
              maxLength={t.bodyMax}
              onChange={(e) => set('body', e.target.value || null)}
            />
          </label>
        ) : null}

        <label style={label}>
          {TEXT.ads.picture}: {t.image.width} × {t.image.height}
          {t.image.required ? '' : ` (${TEXT.ads.optional})`}
          <input
            style={ui.input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/gif"
            onChange={upload}
            disabled={busy}
          />
        </label>
        {ad.mediaId ? (
          <button
            type="button"
            style={ui.secondary}
            onClick={() => setAd((a) => ({ ...a, mediaId: null, mediaUrl: null }))}
          >
            {TEXT.ads.removePicture}
          </button>
        ) : null}

        <label style={{ display: 'block', marginTop: 16 }}>
          <input
            type="checkbox"
            checked={ad.adultsOnly}
            onChange={(e) => set('adultsOnly', e.target.checked)}
          />{' '}
          {TEXT.ads.alcohol}
        </label>

        <h3>{TEXT.ads.when}</h3>
        <p style={ui.muted}>{TEXT.ads.whenHelp}</p>
        <label style={label}>
          {TEXT.ads.starts}
          <input
            style={ui.input}
            type="datetime-local"
            value={toLocal(ad.startsAt)}
            onChange={(e) => set('startsAt', fromLocal(e.target.value))}
          />
        </label>
        <label style={label}>
          {TEXT.ads.ends}
          <input
            style={ui.input}
            type="datetime-local"
            value={toLocal(ad.endsAt)}
            onChange={(e) => set('endsAt', fromLocal(e.target.value))}
          />
        </label>
        <div style={{ ...label, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {DAYS.map((d, i) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={(ad.daysOfWeek & (1 << i)) !== 0}
                onChange={(e) =>
                  set(
                    'daysOfWeek',
                    e.target.checked ? ad.daysOfWeek | (1 << i) : ad.daysOfWeek & ~(1 << i),
                  )
                }
              />{' '}
              {d}
            </label>
          ))}
        </div>
        <label style={{ display: 'block', marginTop: 12 }}>
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) =>
              setAd((a) => ({
                ...a,
                dailyStartMin: e.target.checked ? null : 16 * 60,
                dailyEndMin: e.target.checked ? null : 19 * 60,
              }))
            }
          />{' '}
          {TEXT.ads.allDay}
        </label>
        {allDay ? null : (
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={label}>
              {TEXT.ads.from}
              <input
                style={ui.input}
                type="time"
                value={toTime(ad.dailyStartMin)}
                onChange={(e) => set('dailyStartMin', fromTime(e.target.value))}
              />
            </label>
            <label style={label}>
              {TEXT.ads.to}
              <input
                style={ui.input}
                type="time"
                value={toTime(ad.dailyEndMin)}
                onChange={(e) => set('dailyEndMin', fromTime(e.target.value) || 1440)}
              />
            </label>
          </div>
        )}

        <h3>{TEXT.ads.who}</h3>
        <p style={ui.muted}>{TEXT.ads.whoHelp}</p>
        <label style={label}>
          {TEXT.ads.distance}
          <select
            style={ui.input}
            value={ad.radiusMeters ?? ''}
            onChange={(e) => set('radiusMeters', e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{TEXT.ads.noDistance}</option>
            {RADII.map((r) => (
              <option key={r.meters} value={r.meters}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label style={label}>
          {TEXT.ads.zips}
          <input
            style={ui.input}
            value={ad.zips.join(', ')}
            placeholder="32202, 32204"
            onChange={(e) =>
              set(
                'zips',
                e.target.value
                  .split(/[\s,]+/)
                  .map((z) => z.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>

        {problems.length ? (
          <div style={{ marginTop: 16 }}>
            <strong>{TEXT.ads.beforeSending}</strong>
            <ul style={{ color: COLORS.textMuted }}>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {error ? (
          <p role="alert" style={ui.error}>
            {error}
          </p>
        ) : null}
        {saved ? <p role="status">{saved}</p> : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={{ ...ui.secondary }}
            disabled={busy}
            onClick={() => save(false)}
          >
            {busy ? TEXT.common.saving : TEXT.ads.saveDraft}
          </button>
          {owner ? (
            <button
              type="button"
              style={{ ...ui.primary, width: 'auto', marginTop: 0 }}
              disabled={busy || problems.length > 0}
              onClick={() => save(true)}
            >
              {TEXT.ads.saveAndSubmit}
            </button>
          ) : (
            <span style={ui.muted}>{TEXT.ads.managerNote}</span>
          )}
        </div>
        {ad.status && ad.status !== 'DRAFT' ? (
          <p style={ui.muted}>{TEXT.ads.editLiveNote}</p>
        ) : null}
      </div>

      <div style={{ position: 'sticky', top: 16 }}>
        <h3 style={{ marginTop: 0 }}>{TEXT.ads.previewTitle}</h3>
        <PhoneFrame>
          <AdPreview
            template={ad.template}
            headline={ad.headline}
            body={ad.body}
            imageUrl={ad.mediaUrl}
            placeName={placeName}
            adultsOnly={ad.adultsOnly}
          />
        </PhoneFrame>
      </div>
    </div>
  );
}
