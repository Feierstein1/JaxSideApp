import nodemailer from 'nodemailer';
import { getEnv } from '../env';
import { logger } from '../logger';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

/** SMTP mailer. In development this is Mailpit (Q6); a production provider is still open. */
function smtpMailer(): Mailer {
  const env = getEnv();
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
  });
  return {
    async send(mail) {
      await transport.sendMail({ from: env.SMTP_FROM, ...mail });
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
