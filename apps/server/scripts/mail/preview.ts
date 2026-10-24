/**
 * P15.3: sends one of every email, with sample values, to the local test inbox (Mailpit) so
 * the branded designs can be looked at in a browser: http://localhost:8025
 *
 *   npm run mail:preview -w @jax/server
 *
 * Refuses to run unless the mail server is this computer, so it can never send to a real
 * email provider.
 */
import { getEnv } from '../../src/server/env';
import { getMailer } from '../../src/server/mail/mailer';
import {
  accountDeletedEmail,
  emailChangeCodeEmail,
  emailChangeNoticeEmail,
  emailChangeTakenEmail,
  ownerCodeEmail,
  passwordResetEmail,
  registrationAttemptEmail,
  verificationEmail,
} from '../../src/server/mail/templates';

async function main() {
  const env = getEnv();
  if (!['localhost', '127.0.0.1'].includes(env.SMTP_HOST)) {
    throw new Error(
      `mail:preview only sends to a local test inbox (SMTP_HOST is ${env.SMTP_HOST})`,
    );
  }
  const to = 'preview@example.test';
  const base = 'http://localhost:3000';
  const mails = [
    verificationEmail(to, base, 'sample-token', '482913'),
    registrationAttemptEmail(to, base),
    passwordResetEmail(to, base, 'sample-token', '731905'),
    emailChangeCodeEmail(to, '264118'),
    emailChangeNoticeEmail(to, 'requested'),
    emailChangeNoticeEmail(to, 'completed'),
    emailChangeTakenEmail(to),
    accountDeletedEmail(to, 30),
    ownerCodeEmail(to, '590372', 'Bold Bean Coffee'),
  ];
  for (const mail of mails) await getMailer().send(mail);
  console.log(`sent ${mails.length} emails; open http://localhost:8025`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
