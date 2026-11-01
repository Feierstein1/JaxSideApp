import Link from 'next/link';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, accountFromToken } from '@/server/auth';
import { ApiError } from '@/server/http';
import { invitePreview } from '@/server/invites';
import { TEXT } from '@/text';
import { Card, ui } from '../ui';
import { InviteForm } from './invite-form';

/**
 * B1.3: the page the invite email links to. Opening it changes nothing (mail scanners
 * open links too); only the buttons use the invite.
 */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const preview = await invitePreview(token);
  if (!preview.ok) {
    return (
      <Card>
        <h1 style={{ marginTop: 0 }}>{TEXT.invite.title}</h1>
        <p role="alert" style={ui.error}>
          {preview.message}
        </p>
      </Card>
    );
  }

  let signedInAs: string | null = null;
  const session = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  if (session) {
    try {
      const { account } = await accountFromToken(session, { mutation: false });
      signedInAs = account.email ?? account.username;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
  }
  const back = `/invite?token=${encodeURIComponent(token!)}`;

  return (
    <Card width={460}>
      <h1 style={{ marginTop: 0 }}>{TEXT.invite.title}</h1>
      <p>{TEXT.invite.intro(preview.placeName)}</p>
      <InviteForm token={token!} signedInAs={signedInAs} />
      {signedInAs ? null : (
        <p style={{ ...ui.muted, marginTop: 24 }}>
          {TEXT.invite.haveAccount}{' '}
          <Link href={`/login?next=${encodeURIComponent(back)}`}>{TEXT.invite.signInFirst}</Link>
        </p>
      )}
    </Card>
  );
}
