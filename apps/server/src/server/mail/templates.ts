import type { OutgoingMail } from './mailer';

/*
 * D31: emails lead with a 6-digit code to type into the app, plus a link as a fallback
 * (opening the email on a computer, or before app links exist).
 * The link opens a page with a confirm button that POSTs the token. A plain GET link
 * would be consumed by email security scanners that prefetch links.
 */

/** "482913" -> "482 913" for readability. The app accepts either. */
function spaced(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function verificationEmail(
  to: string,
  baseUrl: string,
  token: string,
  code: string,
): OutgoingMail {
  return {
    to,
    subject: `${spaced(code)} is your Jax confirmation code`,
    text: [
      'Welcome to Jax.',
      '',
      'Enter this code in the app to confirm your email address:',
      '',
      `    ${spaced(code)}`,
      '',
      'The code expires in 15 minutes. You can request a new one in the app.',
      '',
      'Or confirm in a browser (works for 24 hours):',
      `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`,
      '',
      "If you didn't sign up, ignore this email.",
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
      `If it was you, sign in instead. Forgot your password? Use "Forgot password?" in the app, or go to ${baseUrl}/reset-password.`,
      "If it wasn't you, you can ignore this email.",
    ].join('\n'),
  };
}

export function passwordResetEmail(
  to: string,
  baseUrl: string,
  token: string,
  code: string,
): OutgoingMail {
  return {
    to,
    subject: `${spaced(code)} is your Jax password reset code`,
    text: [
      'We received a request to reset your password.',
      '',
      'Enter this code in the app, along with your new password:',
      '',
      `    ${spaced(code)}`,
      '',
      'Or reset it in a browser:',
      `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`,
      '',
      'The code expires in 15 minutes and the link in 30 minutes. Either one works once.',
      "If you didn't ask for this, ignore this email.",
    ].join('\n'),
  };
}
