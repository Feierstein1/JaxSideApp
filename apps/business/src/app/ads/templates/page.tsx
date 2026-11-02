import Link from 'next/link';
import { AD_GIF_LIMITS, AD_TEMPLATES, COLORS, type AdTemplateKind } from '@jax/shared';
import { TEXT } from '@/text';
import { AdPreview, PhoneFrame } from '../ad-preview';

/**
 * D177: the three ad templates with sample content, so the sizes can be judged on a
 * screen before any ad exists. No data and no sign-in: it only shows the templates.
 */
const SAMPLE: Record<AdTemplateKind, { headline: string; body: string | null }> = {
  BANNER: { headline: 'Half-price wings tonight', body: null },
  POST: {
    headline: 'Happy hour 4–7, Tuesday to Friday',
    body: 'Two-for-one drafts and $5 tacos on the patio. Show this ad for a free side.',
  },
  FEATURE: { headline: 'Live music this Saturday', body: 'Local bands from 8 pm. No cover.' },
};

const mb = (b: number) => `${(b / 1_000_000).toFixed(1)} MB`;

export default function TemplatesPage() {
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 16px' }}>
      <Link href="/">← {TEXT.siteName}</Link>
      <h1>{TEXT.ads.templatesTitle}</h1>
      <p style={{ color: COLORS.textMuted, maxWidth: 640 }}>{TEXT.ads.templatesIntro}</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 32,
          marginTop: 24,
        }}
      >
        {(Object.keys(AD_TEMPLATES) as AdTemplateKind[]).map((k) => {
          const t = AD_TEMPLATES[k];
          return (
            <section key={k}>
              <h2 style={{ marginBottom: 4 }}>{t.label}</h2>
              <p style={{ marginTop: 0, color: COLORS.textMuted }}>{t.where}</p>
              <ul style={{ color: COLORS.text, paddingLeft: 18 }}>
                <li>
                  {TEXT.ads.picture}: {t.image.width} × {t.image.height}
                  {t.image.required ? '' : ` (${TEXT.ads.optional})`}, {TEXT.ads.atLeast}{' '}
                  {t.image.minWidth} × {t.image.minHeight}
                </li>
                <li>
                  {TEXT.ads.headline}: {t.headlineMax} {TEXT.ads.characters}
                  {t.bodyMax ? ` · ${TEXT.ads.text}: ${t.bodyMax} ${TEXT.ads.characters}` : ''}
                </li>
                <li>
                  {TEXT.ads.fileSize}: {mb(t.maxBytes.image)} ({TEXT.ads.gif} {mb(t.maxBytes.gif)},{' '}
                  {AD_GIF_LIMITS.maxSeconds} s)
                </li>
              </ul>
              <PhoneFrame>
                <AdPreview
                  template={k}
                  headline={SAMPLE[k].headline}
                  body={SAMPLE[k].body}
                  placeName="Bold Bean"
                  adultsOnly={k === 'POST'}
                />
              </PhoneFrame>
            </section>
          );
        })}
      </div>
    </main>
  );
}
