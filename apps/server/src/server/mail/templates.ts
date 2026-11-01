import { renderEmail } from './layout';
import type { OutgoingMail } from './mailer';

/*
 * D31: emails lead with a 6-digit code to type into the app, plus a link as a fallback
 * (opening the email on a computer, or before app links exist).
 * The link opens a page with a confirm button that POSTs the token. A plain GET link
 * would be consumed by email security scanners that prefetch links.
 * P15.3: each email has a plain-text version and a branded HTML version (layout.ts) with
 * the same content.
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
    subject: `${spaced(code)} is your JaxSide confirmation code`,
    text: [
      'Welcome to JaxSide.',
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
    html: renderEmail({
      preheader: 'Enter this code in the app to confirm your email address.',
      heading: 'Welcome to JaxSide',
      intro: ['Enter this code in the app to confirm your email address:'],
      code,
      codeNote: 'The code expires in 15 minutes. You can request a new one in the app.',
      button: {
        label: 'Confirm in a browser',
        url: `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`,
        note: 'The button works for 24 hours.',
      },
      footnotes: ["If you didn't sign up, ignore this email."],
    }),
  };
}

export function registrationAttemptEmail(to: string, baseUrl: string): OutgoingMail {
  return {
    to,
    subject: 'Someone tried to sign up with your email',
    text: [
      'Someone tried to create a JaxSide account with this email address, but an account already exists.',
      '',
      `If it was you, sign in instead. Forgot your password? Use "Forgot password?" in the app, or go to ${baseUrl}/reset-password.`,
      "If it wasn't you, you can ignore this email.",
    ].join('\n'),
    html: renderEmail({
      preheader: 'An account already exists with this email address.',
      heading: 'Someone tried to sign up with your email',
      intro: [
        'Someone tried to create a JaxSide account with this email address, but an account already exists.',
        'If it was you, sign in instead. Forgot your password? Use "Forgot password?" in the app, or reset it here:',
      ],
      button: { label: 'Reset password', url: `${baseUrl}/reset-password` },
      footnotes: ["If it wasn't you, you can ignore this email."],
    }),
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
    subject: `${spaced(code)} is your JaxSide password reset code`,
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
    html: renderEmail({
      preheader: 'Enter this code in the app to reset your password.',
      heading: 'Reset your password',
      intro: [
        'We received a request to reset your password.',
        'Enter this code in the app, along with your new password:',
      ],
      code,
      codeNote: 'The code expires in 15 minutes.',
      button: {
        label: 'Reset in a browser',
        url: `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`,
        note: 'The button works for 30 minutes. The code and the button each work once.',
      },
      footnotes: ["If you didn't ask for this, ignore this email."],
    }),
  };
}

/** P4.10: sent to the NEW address; the code confirms the change in the app. */
export function emailChangeCodeEmail(to: string, code: string): OutgoingMail {
  return {
    to,
    subject: `${spaced(code)} is your JaxSide email change code`,
    text: [
      'Someone asked to use this address for their JaxSide account.',
      '',
      'If it was you, enter this code in the app to finish the change:',
      '',
      `    ${spaced(code)}`,
      '',
      "The code expires in 15 minutes. If this wasn't you, ignore this email; nothing changes.",
    ].join('\n'),
    html: renderEmail({
      preheader: 'Enter this code in the app to finish changing your email.',
      heading: 'Confirm your new email',
      intro: [
        'Someone asked to use this address for their JaxSide account.',
        'If it was you, enter this code in the app to finish the change:',
      ],
      code,
      codeNote: 'The code expires in 15 minutes.',
      footnotes: ["If this wasn't you, ignore this email; nothing changes."],
    }),
  };
}

/** P4.10: sent to the OLD address when a change starts and when it completes. */
export function emailChangeNoticeEmail(to: string, stage: 'requested' | 'completed'): OutgoingMail {
  return {
    to,
    subject:
      stage === 'requested'
        ? 'Your JaxSide email change was requested'
        : 'Your JaxSide email was changed',
    text: [
      stage === 'requested'
        ? 'A change of the email address on your JaxSide account was requested. It completes only once the new address is confirmed.'
        : 'The email address on your JaxSide account was changed. This address will no longer receive messages from JaxSide.',
      '',
      "If this wasn't you, reset your password from the app right away and contact support.",
    ].join('\n'),
    html: renderEmail({
      preheader:
        stage === 'requested'
          ? 'An email change was requested.'
          : 'Your email address was changed.',
      heading: stage === 'requested' ? 'Email change requested' : 'Your email was changed',
      intro: [
        stage === 'requested'
          ? 'A change of the email address on your JaxSide account was requested. It completes only once the new address is confirmed.'
          : 'The email address on your JaxSide account was changed. This address will no longer receive messages from JaxSide.',
      ],
      footnotes: [
        "If this wasn't you, reset your password from the app right away and contact support.",
      ],
    }),
  };
}

/** P4.10: sent to a new address that already belongs to another account (no disclosure in the app). */
export function emailChangeTakenEmail(to: string): OutgoingMail {
  return {
    to,
    subject: 'Someone tried to use your email on JaxSide',
    text: [
      'Someone tried to switch their JaxSide account to this address, but it already belongs to an account, so nothing changed.',
      "If this wasn't you, you can ignore this email.",
    ].join('\n'),
    html: renderEmail({
      preheader: 'This address already belongs to an account, so nothing changed.',
      heading: 'Someone tried to use your email',
      intro: [
        'Someone tried to switch their JaxSide account to this address, but it already belongs to an account, so nothing changed.',
      ],
      footnotes: ["If this wasn't you, you can ignore this email."],
    }),
  };
}

/** P4.12: confirmation that an account was deleted. */
export function accountDeletedEmail(to: string, days: number): OutgoingMail {
  return {
    to,
    subject: 'Your JaxSide account was deleted',
    text: [
      'Your JaxSide account has been deleted. You can no longer sign in, and your profile is hidden.',
      '',
      `Your email address is kept encrypted for ${days} days in case of abuse reports, then permanently destroyed.`,
      "If you didn't do this, contact support right away.",
    ].join('\n'),
    html: renderEmail({
      preheader: 'Your JaxSide account has been deleted.',
      heading: 'Your account was deleted',
      intro: [
        'Your JaxSide account has been deleted. You can no longer sign in, and your profile is hidden.',
        `Your email address is kept encrypted for ${days} days in case of abuse reports, then permanently destroyed.`,
      ],
      footnotes: ["If you didn't do this, contact support right away."],
    }),
  };
}

/**
 * D172: sent to a verified owner's personal email. The link opens the business website,
 * where they create their business account (or add the place to one they already have).
 * The page only shows the invite; nothing is used up until they press a button there.
 */
export function businessInviteEmail(
  to: string,
  placeName: string,
  url: string,
  days: number,
): OutgoingMail {
  return {
    to,
    subject: `Set up ${placeName} on JaxSide for Business`,
    text: [
      `You're verified as the owner of ${placeName} on JaxSide.`,
      '',
      'You can now set up your business account: reply to your place’s discussion from anywhere, give your staff their own logins, and (soon) run ads.',
      'Your business account is separate from your personal JaxSide account, with its own email and password.',
      '',
      'Set it up here:',
      url,
      '',
      `The link works for ${days} days. If you didn't ask to be an owner, ignore this email.`,
    ].join('\n'),
    html: renderEmail({
      preheader: `Set up your business account for ${placeName}.`,
      heading: 'Set up your business account',
      intro: [
        `You're verified as the owner of ${placeName} on JaxSide.`,
        'Your business account lets you reply to your place’s discussion from anywhere and give your staff their own logins. It is separate from your personal JaxSide account, with its own email and password.',
      ],
      button: {
        label: 'Set up my business account',
        url,
        note: `The link works for ${days} days.`,
      },
      footnotes: ["If you didn't ask to be an owner, ignore this email."],
    }),
  };
}

/** D103: owner verification by business email: the code proves the owner reads it. */
export function ownerCodeEmail(to: string, code: string, placeName: string): OutgoingMail {
  return {
    to,
    subject: `${spaced(code)} is your JaxSide owner code`,
    text: [
      `Someone asked to be verified on JaxSide as the owner of ${placeName}, using this address.`,
      '',
      'If it was you, enter this code in the app:',
      '',
      `    ${spaced(code)}`,
      '',
      "The code expires in 30 minutes. If this wasn't you, ignore this email; nothing changes.",
    ].join('\n'),
    html: renderEmail({
      preheader: `Enter this code in the app to be verified as the owner of ${placeName}.`,
      heading: 'Your owner code',
      intro: [
        `Someone asked to be verified on JaxSide as the owner of ${placeName}, using this address.`,
        'If it was you, enter this code in the app:',
      ],
      code,
      codeNote: 'The code expires in 30 minutes.',
      footnotes: ["If this wasn't you, ignore this email; nothing changes."],
    }),
  };
}
