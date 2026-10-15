import { ResetPassword } from '../token-actions';

export const metadata = { title: 'Reset password · Jax' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return <ResetPassword token={typeof token === 'string' ? token : null} />;
}
