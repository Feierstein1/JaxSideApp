import type { CSSProperties, ReactNode } from 'react';
import { AD_TEMPLATES, DARK, type AdTemplateKind } from '@jax/shared';
import { TEXT } from '@/text';

/**
 * B3.2 / D177: an ad exactly as the JaxSide app shows it (dark theme, phone width), for
 * the editor's live preview and the templates page. The app's own ad card (B3.6) is
 * built to match this. Colors come from `DARK` only.
 */

export type AdPreviewProps = {
  template: AdTemplateKind;
  headline: string;
  body?: string | null;
  imageUrl?: string | null;
  placeName: string;
  adultsOnly?: boolean;
};

const PHONE_WIDTH = 375;
const SIDE = 16;
const CARD_WIDTH = PHONE_WIDTH - SIDE * 2;
/** The app's cards have their top corners clipped (D127). */
const CHAMFER = 14;
const chamferTop: CSSProperties = {
  clipPath: `polygon(${CHAMFER}px 0, calc(100% - ${CHAMFER}px) 0, 100% ${CHAMFER}px, 100% 100%, 0 100%, 0 ${CHAMFER}px)`,
};

function Sponsored({ placeName }: { placeName: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span
        style={{
          background: DARK.raised,
          color: DARK.textMuted,
          borderRadius: 4,
          padding: '1px 6px',
          fontWeight: 800,
          letterSpacing: 0.6,
          fontSize: 10.5,
        }}
      >
        {TEXT.ads.sponsored.toUpperCase()}
      </span>
      <span style={{ color: DARK.textMuted }}>{placeName}</span>
    </div>
  );
}

/** The picture area at the template's shape; a placeholder until a picture is chosen. */
function Picture({ template, url }: { template: AdTemplateKind; url?: string | null }) {
  const t = AD_TEMPLATES[template].image;
  const style: CSSProperties = {
    width: '100%',
    aspectRatio: `${t.width} / ${t.height}`,
    borderRadius: 8,
    display: 'block',
    objectFit: 'cover',
    background: DARK.raised,
  };
  if (url) {
    return <img src={url} alt="" style={style} />;
  }
  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: DARK.placeholder,
        fontSize: 13,
      }}
    >
      {t.width} × {t.height}
    </div>
  );
}

/** Interested / Not interested and the report button (B3.6: the app's version records them). */
function Actions() {
  const pill: CSSProperties = {
    background: DARK.raised,
    color: DARK.text,
    borderRadius: 16,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 600,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
      <span style={pill}>{TEXT.ads.interested}</span>
      <span style={pill}>{TEXT.ads.notInterested}</span>
      <span style={{ marginLeft: 'auto', color: DARK.textMuted, fontSize: 13 }}>
        {TEXT.ads.report}
      </span>
    </div>
  );
}

function AdultsOnly() {
  return (
    <div style={{ color: DARK.textMuted, fontSize: 12, marginTop: 6 }}>{TEXT.ads.adultsOnly}</div>
  );
}

function Card({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return (
    <div
      style={{
        ...chamferTop,
        background: DARK.card,
        width: CARD_WIDTH,
        boxSizing: 'border-box',
        padding: padded ? `${CHAMFER}px ${SIDE}px 10px` : 0,
        color: DARK.text,
      }}
    >
      {children}
    </div>
  );
}

export function AdPreview(p: AdPreviewProps) {
  const headline = p.headline.trim() || TEXT.ads.headlinePlaceholder;
  if (p.template === 'BANNER') {
    return (
      <div style={{ width: CARD_WIDTH }}>
        <Sponsored placeName={p.placeName} />
        <div style={{ marginTop: 6 }}>
          <Picture template="BANNER" url={p.imageUrl} />
        </div>
        <div style={{ color: DARK.text, fontWeight: 700, fontSize: 14, marginTop: 6 }}>
          {headline}
        </div>
        {p.adultsOnly ? <AdultsOnly /> : null}
      </div>
    );
  }
  return (
    <Card>
      <Sponsored placeName={p.placeName} />
      <div
        style={{
          fontWeight: 800,
          fontSize: p.template === 'FEATURE' ? 20 : 16,
          margin: '8px 0 4px',
        }}
      >
        {headline}
      </div>
      {p.body?.trim() ? (
        <div style={{ fontSize: 15, lineHeight: 1.4, whiteSpace: 'pre-wrap', marginBottom: 8 }}>
          {p.body}
        </div>
      ) : null}
      {p.template === 'FEATURE' || p.imageUrl ? (
        <Picture template={p.template} url={p.imageUrl} />
      ) : null}
      {p.adultsOnly ? <AdultsOnly /> : null}
      <Actions />
    </Card>
  );
}

/** A post the way the app lists it, for context around the ad (grey placeholder lines). */
function FakePost() {
  const line = (w: string): CSSProperties => ({
    height: 10,
    width: w,
    background: DARK.raised,
    borderRadius: 5,
    marginTop: 8,
  });
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 21, background: DARK.raised }} />
        <div style={{ flex: 1 }}>
          <div style={line('40%')} />
          <div style={line('25%')} />
        </div>
      </div>
      <div style={line('90%')} />
      <div style={{ ...line('70%'), marginBottom: 6 }} />
    </Card>
  );
}

/** The ad between two posts on a phone-width dark screen, as people will see it. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: PHONE_WIDTH,
        maxWidth: '100%',
        background: DARK.page,
        borderRadius: 24,
        padding: `${SIDE}px 0`,
        display: 'grid',
        justifyItems: 'center',
        gap: 12,
        overflow: 'hidden',
      }}
    >
      <FakePost />
      {children}
      <FakePost />
    </div>
  );
}
