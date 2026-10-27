import nodemailer from 'nodemailer';
import { getEnv } from '../env';
import { logger } from '../logger';
import { EMAIL_LOGO } from './logo';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  /** P15.3: the branded version (layout.ts); mail apps show it instead of `text`. */
  html?: string;
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

/**
 * SMTP mailer: Mailpit in development (Q6); Amazon SES on staging (D139), which needs a
 * login and an encrypted connection (STARTTLS on port 587).
 */
function smtpMailer(): Mailer {
  const env = getEnv();
  const login = env.SMTP_USER && env.SMTP_PASS;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    ...(login ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }, requireTLS: true } : {}),
  });
  return {
    async send(mail) {
      await transport.sendMail({
        from: env.SMTP_FROM,
        ...mail,
        // The header logo travels with the email, shown inline (see layout.ts).
        attachments: mail.html
          ? [{ filename: 'jaxside.png', content: EMAIL_LOGO.png, cid: EMAIL_LOGO.cid }]
          : undefined,
      });
    },
  };
}

let current: Mailer | undefined;

export function getMailer(): Mailer {
  current ??= smtpMailer();
  return current;
}

/** Test hook: swap in a capturing mailer. */
export function setMailer(mailer: Mailer | undefined): void {
  current = mailer;
}

/**
 * Sends without failing the request. A mail outage must not reveal whether an
 * account exists (e.g. reset requests), so errors are logged, not thrown.
 */
export async function sendSafely(mail: OutgoingMail, purpose: string): Promise<void> {
  try {
    await getMailer().send(mail);
  } catch (err) {
    logger.error({ err, purpose }, 'email send failed');
  }
}
