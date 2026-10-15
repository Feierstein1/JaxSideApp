import type { OutgoingMail } from './mailer';

/*
 * Email links open a server page with a confirm button that POSTs the token.
 * A plain GET link would be consumed by email security scanners that prefetch links.
 */

export function verificationEmail(to: string, baseUrl: string, token: string): OutgoingMail {
  return {
    to,
    subject: 'Confirm your Jax email address',
    text: [
      'Welcome to Jax.',
      '',
      'Confirm your email address to start posting:',
      `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`,
      '',
      "This link expires in 24 hours. If you didn't sign up, ignore this email.",
    ].join('\n'),
  };
}

export function registrationAttemptEmail(to: string, baseUrl: string): OutgoingMail {
  return {
    to,
    subject: 'Someone tried to sign up with your email',
    text: [
      'Someone tried to create a Jax account with this email address, but an account already exists.',
      '',
      `If it was you, sign in instead. Forgot your password? Reset it from the app or at ${baseUrl}/reset-password.`,
      "If it wasn't you, you can ignore this email.",
    ].join('\n'),
  };
}

export function passwordResetEmail(to: string, baseUrl: string, token: string): OutgoingMail {
  return {
    to,
    subject: 'Reset your Jax password',
    text: [
      'We received a request to reset your password.',
      '',
      `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`,
      '',
      "This link expires in 30 minutes and works once. If you didn't ask for this, ignore this email.",
    ].join('\n'),
  };
}
