import Link from 'next/link';
import { TEXT } from '@/text';
import { PasswordForm } from '../password/password-form';
import { requireAccount } from '../require-account';
import { Card, ui } from '../ui';
import { TwoFactorPanel } from './two-factor-panel';

export default async function SecurityPage() {
  const account = await requireAccount();
  return (
    <Card width={520}>
      <Link href="/">{TEXT.common.back}</Link>
      <h1>{TEXT.password.title}</h1>
      <PasswordForm forced={false} />
      <h2 style={{ marginTop: 32 }}>{TEXT.twoFactor.title}</h2>
      <p style={ui.muted}>{account.totpEnabledAt ? TEXT.twoFactor.on : TEXT.twoFactor.off}</p>
      <TwoFactorPanel on={account.totpEnabledAt !== null} />
    </Card>
  );
}
