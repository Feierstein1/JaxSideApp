/**
 * In-app policy text (P4.13, §5.1). Plain text, shown by the app and the web pages.
 *
 * DRAFT: written from the app's actual behavior and recorded decisions (D11–D41), not
 * by a lawyer. An attorney must review before any public launch (Q11, risks R3/R4).
 */

export interface PolicySection {
  heading: string;
  body: string;
}
export interface Policy {
  key: PolicyKey;
  title: string;
  updated: string;
  sections: PolicySection[];
}

export const POLICY_KEYS = ['terms', 'privacy', 'guidelines', 'retention'] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];

const DRAFT: PolicySection = {
  heading: 'Draft',
  body: 'This is a draft for testing. It has not been reviewed by a lawyer yet and will be updated before Jax launches publicly.',
};
const UPDATED = '2026-10-15';

export const POLICIES: Record<PolicyKey, Policy> = {
  terms: {
    key: 'terms',
    title: 'Terms of Service',
    updated: UPDATED,
    sections: [
      DRAFT,
      {
        heading: 'Who can use Jax',
        body: 'Jax is for adults 18 and older. When you sign up, you confirm you meet that age. We check your birth year at signup but do not verify identity.',
      },
      {
        heading: 'A Jacksonville community',
        body: 'Posting, commenting, voting and reading local discussions require that you are physically inside Duval County, confirmed by your phone’s location while you use the app. Faking your location is not allowed.',
      },
      {
        heading: 'Your content',
        body: 'You own what you post. By posting, you let Jax display it to other users in the app. You are responsible for what you post. Don’t post anything you don’t have the right to share.',
      },
      {
        heading: 'Zero tolerance for objectionable content',
        body: 'Content and behavior that break the Community Guidelines (threats, harassment, hate, sexual content involving minors, doxxing, scams and similar) are removed, and accounts responsible may be suspended or banned. You can report content and block other users at any time.',
      },
      {
        heading: 'Accounts',
        body: 'Keep your password safe. We may suspend or end accounts that break these terms, including attempts to get around a ban. You can delete your account at any time in Account → Settings.',
      },
      {
        heading: 'No warranty',
        body: 'Jax is provided as is. Information posted by users may be wrong or out of date. Use your own judgment.',
      },
    ],
  },

  privacy: {
    key: 'privacy',
    title: 'Privacy Policy',
    updated: UPDATED,
    sections: [
      DRAFT,
      {
        heading: 'What other people see',
        body: 'Your username, your bio, your join date, and what you post. Never your email, your exact location, or anything you didn’t post.',
      },
      {
        heading: 'Your email',
        body: 'Used only to confirm your account and to reset your password. It is stored encrypted, with the keys kept separately from our database, and is never shown to other users.',
      },
      {
        heading: 'Your birth year',
        body: 'Used once at signup to check you are 18 or older, then discarded. We keep only a note that you passed the check.',
      },
      {
        heading: 'Your location',
        body: 'Jax uses your location only while you are using the app, never in the background. Each time you read or post, your phone sends its current location so we can check you’re in Duval County and close enough to the conversation. Posts are stored with a rounded location (about 100 meters), never your exact spot. The exact readings are kept for 30 days for abuse review, are visible only to administrators, and are then deleted.',
      },
      {
        heading: 'Your device',
        body: 'The app gets a random installation ID from our server. It is not a hardware ID, it resets if you reinstall the app, and it is used only to prevent abuse and ban evasion.',
      },
      {
        heading: 'Sharing',
        body: 'We don’t sell your information or show ads. We share information only when the law requires it, for example a valid legal request or a mandatory report of child sexual abuse material.',
      },
      {
        heading: 'Your choices',
        body: 'You can change your username, bio, email and password, turn off location in your phone’s settings (Jax then can’t show local content), and delete your account in Account → Settings. See the Data Retention policy for what happens after deletion.',
      },
    ],
  },

  guidelines: {
    key: 'guidelines',
    title: 'Community Guidelines',
    updated: UPDATED,
    sections: [
      DRAFT,
      {
        heading: 'Be a good neighbor',
        body: 'Jax is for real conversations about Jacksonville. Disagreement and the occasional swear word are fine. Making it unpleasant for others is not.',
      },
      {
        heading: 'Not allowed',
        body: '• Threats, or encouraging violence\n• Harassment, stalking, or targeting someone\n• Sharing someone’s private information (doxxing)\n• Sexual content involving minors, or intimate images shared without consent\n• Hate based on who someone is\n• Spam, scams, impersonation, or malicious links\n• Faking your location or getting around a ban\n• Anything else that is clearly illegal',
      },
      {
        heading: 'What happens',
        body: 'Content that breaks these rules is removed. Accounts get a warning, then temporary suspensions, then a permanent ban. Serious cases may skip steps. Child sexual abuse material is reported to the authorities.',
      },
      {
        heading: 'Help keep it good',
        body: 'Use Report on anything that breaks these rules, and Block anyone you don’t want to see. Reports are reviewed by people, not just software.',
      },
    ],
  },

  retention: {
    key: 'retention',
    title: 'Data Retention',
    updated: UPDATED,
    sections: [
      DRAFT,
      {
        heading: 'Location readings',
        body: 'Exact location readings from your phone are deleted after 30 days.',
      },
      {
        heading: 'Guest mode',
        body: 'A guest session expires after 30 days without use. Guest comments are shown for one year from when they were posted, then deleted, except when they are part of an open report. Data about an expired guest session is deleted after 180 days, except for banned guests, which are kept so the ban stays in effect.',
      },
      {
        heading: 'Deleting your account',
        body: 'When you delete your account, you are signed out everywhere, can’t sign in, and your profile disappears immediately. Your posts stay but show “deleted user.” Your encrypted email is kept for 30 days in case of abuse reports, then permanently destroyed, including in backups. If an account is part of a legal or safety investigation, its data may be kept longer, until the investigation ends.',
      },
      {
        heading: 'Moderation records',
        body: 'Reports and moderation decisions are kept for up to 2 years to keep enforcement consistent.',
      },
      {
        heading: 'Posts and comments',
        body: 'Your posts and comments stay until you delete them, or they are removed for breaking the rules.',
      },
    ],
  },
};
