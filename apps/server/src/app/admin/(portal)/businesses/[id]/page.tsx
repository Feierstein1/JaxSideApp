import { notFound } from 'next/navigation';
import { getBusiness } from '@/server/admin/businesses';
import { ApiError } from '@/server/http';
import { ui } from '../../../admin-ui';
import { BusinessActions, MoveOwnerForm } from '../../../business-forms';
import { requireAdminPage } from '../../../require-admin-page';
import { Pill, Table, td, when, words } from '../../admin-table';

export const dynamic = 'force-dynamic';

/** B1.7: one business login: places, team, sign-ins, claims, activity, plan; and actions. */
export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let b;
  try {
    b = await getBusiness(id);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  const live = b.places.filter((p) => !p.revokedAt);
  const past = b.places.filter((p) => p.revokedAt);
  return (
    <>
      <p>
        <a href="/admin/businesses">← Businesses</a>
      </p>
      <h1 style={{ marginBottom: 4 }}>{b.signInName}</h1>
      <p style={{ marginTop: 0 }}>
        <Pill tone={b.status === 'ACTIVE' ? 'ok' : 'alert'}>{words(b.status)}</Pill>
        <Pill>{b.kind === 'owner' ? 'Owner account' : 'Staff login'}</Pill>
        {b.twoFactorOn ? <Pill>two-step sign-in on</Pill> : null}
        {b.mustChangePassword ? <Pill>must choose a new password</Pill> : null}
        {b.lockedUntil ? <Pill tone="alert">locked until {when(b.lockedUntil)}</Pill> : null}
      </p>
      {b.owner ? (
        <p>
          Staff login of <a href={`/admin/businesses/${b.owner.id}`}>{b.owner.email}</a>
        </p>
      ) : null}
      <p style={ui.muted}>
        Joined {when(b.createdAt)} · last sign-in {b.lastSignInAt ? when(b.lastSignInAt) : 'never'}{' '}
        · {b.activeSessions} signed-in session{b.activeSessions === 1 ? '' : 's'} (whole business)
      </p>

      <div style={ui.card}>
        <h2 style={{ marginTop: 0 }}>Actions</h2>
        <BusinessActions id={b.id} status={b.status} kind={b.kind} />
      </div>

      <h2>Places</h2>
      {live.length === 0 ? <p style={ui.muted}>No places now.</p> : null}
      {live.length ? (
        <Table head={['Place', 'Role', 'Since', 'Verified claim (phone app)', '']}>
          {live.map((p) => (
            <tr key={p.placeId}>
              <td style={td}>
                {p.name}
                {p.placeStatus !== 'ACTIVE' ? (
                  <Pill tone="alert">{words(p.placeStatus)}</Pill>
                ) : null}
                <div style={ui.muted}>{p.address ?? ''}</div>
              </td>
              <td style={td}>
                {words(p.role)}
                {p.staffName ? ` · shown as “${p.staffName}”` : ''}
              </td>
              <td style={td}>{when(p.since)}</td>
              <td style={td}>
                {p.claim ? (
                  <>
                    <a href={`/admin/users/${p.claim.appUser.id}`}>@{p.claim.appUser.username}</a> (
                    {words(p.claim.status)}, {words(p.claim.method)}
                    {p.claim.verifiedAt ? `, ${when(p.claim.verifiedAt)}` : ''})
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td style={td}>
                {p.role === 'OWNER' ? <MoveOwnerForm placeId={p.placeId} /> : null}
              </td>
            </tr>
          ))}
        </Table>
      ) : null}
      {past.length ? (
        <p style={ui.muted}>
          Past places:{' '}
          {past.map((p) => `${p.name} (${words(p.role)}, until ${when(p.revokedAt!)})`).join('; ')}
        </p>
      ) : null}

      {b.kind === 'owner' ? (
        <>
          <h2>Team</h2>
          {b.team.length === 0 ? <p style={ui.muted}>No staff logins.</p> : null}
          {b.team.length ? (
            <Table head={['Login', 'Status', 'Places', 'Last sign-in']}>
              {b.team.map((e) => (
                <tr key={e.id}>
                  <td style={td}>
                    <a href={`/admin/businesses/${e.id}`}>{e.username}</a>
                  </td>
                  <td style={td}>
                    <Pill tone={e.status === 'ACTIVE' ? 'ok' : 'alert'}>{words(e.status)}</Pill>
                    {e.mustChangePassword ? <Pill>new password pending</Pill> : null}
                  </td>
                  <td style={td}>
                    {e.places
                      .map(
                        (p) =>
                          `${p.name} (${words(p.role)}${p.staffName ? `, “${p.staffName}”` : ''})`,
                      )
                      .join('; ') || '—'}
                  </td>
                  <td style={td}>{e.lastSignInAt ? when(e.lastSignInAt) : 'never'}</td>
                </tr>
              ))}
            </Table>
          ) : null}
        </>
      ) : null}

      <h2>Activity</h2>
      <p>
        Last 30 days: {b.activity.posts30} post{b.activity.posts30 === 1 ? '' : 's'},{' '}
        {b.activity.replies30} repl{b.activity.replies30 === 1 ? 'y' : 'ies'} (whole business).
      </p>
      {b.activity.recent.length ? (
        <Table head={['When', 'Place', 'What', 'Written by', 'Status']}>
          {b.activity.recent.map((r) => (
            <tr key={`${r.kind}-${r.id}`}>
              <td style={td}>{when(r.createdAt)}</td>
              <td style={td}>{r.place}</td>
              <td style={{ ...td, maxWidth: 380 }}>
                <span style={ui.muted}>{r.kind === 'post' ? 'Post: ' : 'Reply: '}</span>
                {r.body}
              </td>
              <td style={td}>{r.by}</td>
              <td style={td}>{words(r.status)}</td>
            </tr>
          ))}
        </Table>
      ) : null}

      <h2>Plan and ads</h2>
      {b.subscriptions.length === 0 ? <p style={ui.muted}>No plan yet.</p> : null}
      {b.subscriptions.map((s) => (
        <p key={s.id}>
          {s.plan} ({s.liveAdLimit} live ad{s.liveAdLimit === 1 ? '' : 's'}) · {words(s.status)}
          {s.comped ? ' · free promo' : ''} · from {when(s.startsAt)}
          {s.endsAt ? ` to ${when(s.endsAt)}` : ''}
        </p>
      ))}
      <p style={ui.muted}>Saved ads: {b.adCount}</p>

      {b.invitesUsed.length ? (
        <>
          <h2>Invites used</h2>
          <p style={ui.muted}>
            {b.invitesUsed.map((i) => `${i.place} (${i.usedAt ? when(i.usedAt) : ''})`).join('; ')}
          </p>
        </>
      ) : null}
    </>
  );
}
