import { notFound } from 'next/navigation';
import { POLICIES, POLICY_KEYS, type PolicyKey } from '@jax/shared';

/** P4.13: policy pages on the web (same text as the app). Rendered as plain text. */
export function generateStaticParams() {
  return POLICY_KEYS.map((key) => ({ key }));
}

export default async function PolicyPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!(POLICY_KEYS as readonly string[]).includes(key)) notFound();
  const policy = POLICIES[key as PolicyKey];
  return (
    <main
      style={{
        maxWidth: 680,
        margin: '40px auto',
        padding: 16,
        fontFamily: 'system-ui',
        lineHeight: 1.5,
      }}
    >
      <h1>{policy.title}</h1>
      <p style={{ color: '#4A4A4A' }}>Last updated {policy.updated}</p>
      {policy.sections.map((s) => (
        <section key={s.heading}>
          <h2 style={{ fontSize: 18 }}>{s.heading}</h2>
          <p style={{ whiteSpace: 'pre-line' }}>{s.body}</p>
        </section>
      ))}
    </main>
  );
}
