import { VerifyEmail } from '../token-actions';

export const metadata = { title: 'Confirm email · Jax' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return <VerifyEmail token={typeof token === 'string' ? token : null} />;
}
