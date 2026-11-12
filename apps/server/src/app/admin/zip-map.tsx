'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import { COLORS } from '@jax/shared';
import { ui } from './admin-ui';

type Count = {
  value: number | null;
  parts: {
    morning: number | null;
    afternoon: number | null;
    evening: number | null;
    night: number | null;
  };
};

/** Five shades of the brand color, light to dark (opacity only, so the tokens stay the source). */
const SHADES = [0.16, 0.32, 0.5, 0.68, 0.88];
const PARTS = [
  ['morning', 'Morning (6–12)'],
  ['afternoon', 'Afternoon (12–5)'],
  ['evening', 'Evening (5–10)'],
  ['night', 'Night (10–6)'],
] as const;

const fmt = (n: number | null) => (n === null ? 'fewer than 10' : n.toLocaleString('en-US'));

/**
 * D229: the ZIP code map. Hover (or tab to) a section for its numbers; click it for that ZIP's
 * day-by-day page. Numbers under 10 never arrive here (the server sends null).
 */
export function ZipMap({
  viewBox,
  county,
  zips,
  counts,
  measure,
  partsMeasure,
  zipHref,
}: {
  viewBox: string;
  county: string;
  zips: { zip: string; area: string | null; d: string }[];
  counts: Record<string, Count>;
  measure: 'people' | 'visits';
  partsMeasure: 'people' | 'visits';
  /** Where a click goes (null: not clickable). */
  zipHref: Record<string, string | null>;
}) {
  const [hover, setHover] = useState<{ zip: string; x: number; y: number } | null>(null);

  // Breaks between the shades: quantiles of the numbers shown, so the shades spread out.
  const breaks = useMemo(() => {
    const vals = Object.values(counts)
      .map((c) => c.value)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (!vals.length) return [];
    return SHADES.slice(1).map(
      (_, i) => vals[Math.floor(((i + 1) * vals.length) / SHADES.length)]!,
    );
  }, [counts]);
  const shade = (v: number) => SHADES[breaks.filter((b) => v >= b).length] ?? SHADES[0]!;

  const fillFor = (zip: string) => {
    const c = counts[zip];
    if (!c) return { fill: COLORS.background, opacity: 1 }; // nobody
    if (c.value === null) return { fill: COLORS.hairline, opacity: 1 }; // fewer than 10
    return { fill: COLORS.primary, opacity: shade(c.value) };
  };

  const unit = measure === 'people' ? 'people' : 'visits (each day’s people, added up)';
  const partsUnit = partsMeasure === 'people' ? 'people' : 'visits';
  const current = hover ? zips.find((z) => z.zip === hover.zip) : null;
  const c = hover ? counts[hover.zip] : undefined;

  const track = (zip: string) => (e: MouseEvent<SVGPathElement>) => {
    const box = e.currentTarget.ownerSVGElement!.parentElement!.getBoundingClientRect();
    setHover({ zip, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <div>
      <div style={{ position: 'relative', maxWidth: 900 }}>
        <svg
          viewBox={viewBox}
          role="img"
          aria-label="Map of Duval County by ZIP code"
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseLeave={() => setHover(null)}
        >
          <path
            d={county}
            fill={COLORS.surfaceMuted}
            stroke={COLORS.textMuted}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          {zips.map((z) => {
            const f = fillFor(z.zip);
            const on = hover?.zip === z.zip;
            const href = zipHref[z.zip];
            return (
              <path
                key={z.zip}
                d={z.d}
                fill={f.fill}
                fillOpacity={f.opacity}
                stroke={on ? COLORS.text : COLORS.cardBorder}
                strokeWidth={on ? 2.5 : 1}
                vectorEffect="non-scaling-stroke"
                tabIndex={0}
                role={href ? 'link' : undefined}
                aria-label={`${z.zip}${z.area ? ` ${z.area}` : ''}: ${fmt(counts[z.zip]?.value ?? 0)} ${measure}`}
                style={{ cursor: href ? 'pointer' : 'default', outline: 'none' }}
                onMouseMove={track(z.zip)}
                onFocus={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const box =
                    e.currentTarget.ownerSVGElement!.parentElement!.getBoundingClientRect();
                  setHover({
                    zip: z.zip,
                    x: r.left + r.width / 2 - box.left,
                    y: r.top + r.height / 2 - box.top,
                  });
                }}
                onBlur={() => setHover(null)}
                onClick={() => {
                  if (href) window.location.href = href;
                }}
                onKeyDown={(e) => {
                  if (href && (e.key === 'Enter' || e.key === ' ')) window.location.href = href;
                }}
              />
            );
          })}
        </svg>
        {hover && current ? (
          <div
            role="status"
            style={{
              position: 'absolute',
              left: Math.min(hover.x + 14, 640),
              top: hover.y + 14,
              pointerEvents: 'none',
              background: COLORS.background,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 10,
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
              padding: '10px 12px',
              minWidth: 190,
              fontSize: 13,
              zIndex: 2,
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {current.zip}
              {current.area ? <span style={{ fontWeight: 500 }}> · {current.area}</span> : null}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 2px' }}>
              {c ? fmt(c.value) : '0'}
            </div>
            <div style={{ color: COLORS.textMuted, marginBottom: 6 }}>{unit}</div>
            {c && c.value !== null ? (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {PARTS.map(([k, label]) => (
                    <tr key={k}>
                      <td style={{ padding: '1px 0', color: COLORS.textMuted }}>{label}</td>
                      <td style={{ padding: '1px 0', textAlign: 'right' }}>{fmt(c.parts[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {c && c.value !== null && partsMeasure !== measure ? (
              <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 4 }}>
                Parts of the day count {partsUnit}.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        aria-label="Key"
        style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}
      >
        <span style={ui.muted}>
          Fewer {'→'} more {measure}:
        </span>
        <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {SHADES.map((o, i) => (
            <span
              key={o}
              title={
                breaks.length
                  ? i === 0
                    ? `10–${(breaks[0] ?? 10) - 1}`
                    : `${breaks[i - 1]}${breaks[i] ? `–${breaks[i]! - 1}` : '+'}`
                  : undefined
              }
              style={{
                width: 26,
                height: 14,
                borderRadius: 3,
                background: COLORS.primary,
                opacity: o,
                display: 'inline-block',
              }}
            />
          ))}
        </span>
        <Swatch color={COLORS.hairline} label="Fewer than 10" />
        <Swatch color={COLORS.background} label="Nobody" />
      </div>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
      <span
        style={{
          width: 18,
          height: 14,
          borderRadius: 3,
          background: color,
          border: `1px solid ${COLORS.cardBorder}`,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}
