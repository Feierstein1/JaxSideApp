import nodemailer from 'nodemailer';
import { getEnv } from './env';

/**
 * B1.8: this site's own email (the app server has its own). SMTP: Mailpit in development;
 * the production provider is chosen later (D172). Without SMTP_HOST, nothing is sent.
 */

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

function smtpMailer(): Mailer {
  const env = getEnv();
  if (!env.SMTP_HOST) {
    return {
      async send(mail) {
        console.warn(`email not sent (no SMTP_HOST): "${mail.subject}"`);
      },
    };
  }
  const login = env.SMTP_USER && env.SMTP_PASS;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    ...(login ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }, requireTLS: true } : {}),
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
