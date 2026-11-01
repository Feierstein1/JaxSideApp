import { TEXT } from '@/text';
import { requireAccount } from '../require-account';
import { Card, ui } from '../ui';
import { PasswordForm } from './password-form';

export default async function PasswordPage() {
  const account = await requireAccount({ passwordPage: true });
  return (
    <Card>
      <h1 style={{ marginTop: 0 }}>{TEXT.password.title}</h1>
      {account.mustChangePassword && <p style={ui.muted}>{TEXT.password.forcedHelp}</p>}
      <PasswordForm forced={account.mustChangePassword} />
    </Card>
  );
}
