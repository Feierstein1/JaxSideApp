import { checkCredentials } from '../auth/service';
import { ipSubject } from '../client-ip';
import { ApiError } from '../http';
import { resolveInstallation } from '../installations';

/**
 * P5.7 (D59): banned or suspended people can't sign in, so the appeal routes take
 * their username/email and password instead. Same failed-attempt limits as login.
 * This grants nothing but seeing their standing and filing an appeal; a banned
 * phone may still appeal.
 */
export async function restrictedUser(
  req: Request,
  input: { identifier: string; password: string },
) {
  const now = new Date();
  const user = await checkCredentials(
    input,
    { ipSubject: ipSubject(req), installation: await resolveInstallation(req), now },
    { refuseBannedInstallation: false },
  );
  const restricted =
    user.status === 'BANNED' ||
    (user.status === 'SUSPENDED' && (!user.suspendedUntil || user.suspendedUntil > now));
  if (!restricted) {
    throw new ApiError(
      400,
      'NOT_RESTRICTED',
      'Your account isn’t suspended or banned. Sign in to see your account standing.',
    );
  }
  return user;
}
