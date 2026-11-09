import { notFound } from 'next/navigation';
import { getBusiness } from '@/server/admin/businesses';
import { listPlans } from '@/server/admin/plans';
import { ApiError } from '@/server/http';
import { ui } from '../../../admin-ui';
import {
  BusinessActions,
  BusinessStrikeForm,
  CompPlanForm,
  MoveOwnerForm,
} from '../../../business-forms';
import { NotifyForReport, VoidStrike } from '../../../forms';
import { requireAdminPage } from '../../../require-admin-page';
import { Pager, Pill, Table, td, when, words } from '../../admin-table';
import { pageNumber } from '@/server/admin/paging';

export const dynamic = 'force-dynamic';

const STRIKES = new Set(['WARN', 'SUSPEND', 'BAN']);
const WHAT: Record<string, string> = {
  business: 'place post',
  comment: 'reply',
  photo: 'picture or video', // D195
};

/** The ladder step a strike gives now (D191: same ladder as people). */
function stepLabel(next: { action: string; hours?: number } | null) {
  if (!next) return null;
  if (next.action === 'WARN') return 'warning';
  if (next.action === 'BAN') return 'ban';
  return next.hours! % 24 === 0
    ? `${next.hours! / 24} day suspension`
    : `${next.hours} h suspension`;
}

const VERIFIED_BY: Record<string, string> = {
  GOOGLE: 'With Google',
  ADMIN: 'By JaxSide',
  LEGACY_CLAIM: 'Earlier, in the phone app',
};

/** B1.7: one business login: places, team, sign-ins, activity, plan; and actions. */
export default async function BusinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ spage?: string; rpage?: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  let b;
  try {
    b = await getBusiness(id, {
      strikesPage: pageNumber(sp.spage),
      reportsPage: pageNumber(sp.rpage),
    });
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  const live = b.places.filter((p) => !p.revokedAt);
  const past = b.places.filter((p) => p.revokedAt);
  const step = stepLabel(b.nextStrike);
  const strikesUrl = `/api/v1/admin/businesses/${b.id}/strikes`;
  // D210: strikes (spage) and reports (rpage) are paged on their own.
  const base = `/admin/businesses/${b.id}`;
  const pageParams = { spage: sp.spage, rpage: sp.rpage };
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
        {b.suspendedUntil ? (
          <Pill tone="alert">strike suspension until {when(b.suspendedUntil)}</Pill>
        ) : null}
      </p>
      {b.avatarUrl ? (
        <img
          src={b.avatarUrl}
          alt="This login’s profile picture"
          width={96}
          height={96}
          style={{ borderRadius: 48, objectFit: 'cover' }}
        />
      ) : null}
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
        <BusinessActions
          id={b.id}
          status={b.status}
          kind={b.kind}
          hasPicture={b.avatarUrl !== null}
        />
      </div>

      <h2 style={{ marginBottom: 0 }}>Strikes (D191)</h2>
      <p style={ui.muted}>
        Same ladder as people. Strikes go to this login only (an Owner’s ban closes its staff logins
        too); each one shows in their bell on the business website.
      </p>
      {step ? <BusinessStrikeForm id={b.id} step={step} /> : null}
      {b.strikesPage.total === 0 ? (
        <p style={ui.muted}>Nothing on record.</p>
      ) : (
        <Table head={['Action', 'Reason (shown to them)', 'Internal note', 'By', 'When', '']}>
          {b.strikes.map((a) => (
            <tr key={a.id} style={a.voidedAt ? { opacity: 0.5 } : undefined}>
              <td style={td}>
                {words(a.action)}
                {a.durationHours ? ` (${a.durationHours} h)` : ''}
                {a.voidedAt ? ` (cancelled: ${a.voidReason ?? ''})` : ''}
              </td>
              <td style={{ ...td, maxWidth: 320 }}>{a.reason}</td>
              <td style={td}>{a.internalNote ?? ''}</td>
              <td style={td}>@{a.by}</td>
              <td style={td}>{when(a.createdAt)}</td>
              <td style={td}>
                {STRIKES.has(a.action) && a.action !== 'BAN' && !a.voidedAt ? (
                  <VoidStrike userId={b.id} strikeId={a.id} url={strikesUrl} />
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={b.strikesPage} base={base} params={pageParams} param="spage" />

      <h2 style={{ marginBottom: 0 }}>Reports about what this login wrote</h2>
      {b.reportsPage.total === 0 ? (
        <p style={ui.muted}>None.</p>
      ) : (
        <Table head={['Reason', 'Details', 'About', 'Reported by', 'Status', 'When', '']}>
          {b.reports.map((r) => (
            <tr key={r.id}>
              <td style={td}>{words(r.reason)}</td>
              <td style={{ ...td, maxWidth: 320 }}>{r.details ?? ''}</td>
              <td style={td}>
                {r.caseHref && r.what ? <a href={r.caseHref}>{WHAT[r.what] ?? r.what}</a> : ''}
              </td>
              <td style={td}>{r.reporter}</td>
              <td style={td}>
                <Pill tone={r.status === 'OPEN' ? 'alert' : 'muted'}>{words(r.status)}</Pill>
              </td>
              <td style={td}>{when(r.createdAt)}</td>
              <td style={td}>
                {r.strike ? (
                  <span style={ui.muted}>
                    Notified ({words(r.strike.action)}) {when(r.strike.createdAt)}
                  </span>
                ) : step ? (
                  <NotifyForReport
                    userId={b.id}
                    reportId={r.id}
                    step={step}
                    url={strikesUrl}
                    suggested={`Your ${r.what ? (WHAT[r.what] ?? 'post') : 'post'} was reported for ${words(r.reason)}. Please follow the Community Guidelines.`}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={b.reportsPage} base={base} params={pageParams} param="rpage" />

      <h2>Places</h2>
      {live.length === 0 ? <p style={ui.muted}>No places now.</p> : null}
      {live.length ? (
        <Table head={['Place', 'Role', 'Since', 'Verified', '']}>
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
                {/* D185: how the Owner was verified; never a personal app account (B6.5). */}
                {p.verifiedBy
                  ? `${VERIFIED_BY[p.verifiedBy]}${p.verifiedAt ? `, ${when(p.verifiedAt)}` : ''}`
                  : '—'}
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
      {b.kind === 'owner' && b.status !== 'REVOKED' ? (
        <div style={ui.card}>
          <h3 style={{ marginTop: 0 }}>Give a plan</h3>
          <CompPlanForm
            accountId={b.id}
            plans={(await listPlans()).filter((p) => p.active)}
            hasPlan={b.subscriptions.some((s) => s.status === 'ACTIVE')}
          />
        </div>
      ) : null}

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
