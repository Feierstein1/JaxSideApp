/**
 * In-app policy text (P4.13, §5.1). Plain text, shown by the app and the web pages.
 *
 * Beta text, written from the app's actual behavior and recorded decisions. Used as-is
 * for the beta (D52); an optional legal review can happen before a wide public launch.
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
  heading: 'Beta',
  body: 'Jax is in beta. These policies may change as the app grows; we’ll update the date above when they do.',
};
const UPDATED = '2026-10-22';

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
        body: 'Jax uses your location only while you are using the app, never in the background. Each time you read or post, your phone sends its current location so we can check you’re in Duval County and close enough to the conversation. Posts are stored with a rounded location (about 100 meters), never your exact spot. Readings used only to show you content are not saved. When you post, comment, vote, report, suggest or verify a place, or send a message (or try to and are refused), that exact reading is kept for 30 days for abuse review, is visible only to administrators, and is then deleted.',
      },
      {
        heading: 'Your device',
        body: 'The app gets a random installation ID from our server. It is not a hardware ID, it resets if you reinstall the app, and it is used only to prevent abuse and ban evasion.',
      },
      {
        heading: 'Private messages',
        body: 'Messages between friends are stored encrypted on our servers. They are not end-to-end encrypted, so that reports can be checked: moderators see a private message only if someone in the chat reports it, and then they see that message and the 10 around it. That copy is kept with the report for one year. Unsending a message removes it for both of you; deleting your account deletes every message you sent.',
      },
      {
        heading: 'Business owners',
        body: 'If you verify that you own a business, we use the business email address you give only once, to send a code (we keep just its domain); a website link or a phone call to the business’s listed number may be checked by our team. In a dispute we may ask for proof of ownership (for example ID or a Florida business record) outside the app; those documents are deleted once the question is settled. Your Owner tag shows only on your posts in that business’s discussion.',
      },
      {
        heading: 'Area statistics',
        body: 'When you open Jax, we count that someone used the app in your ZIP code that day, and in which part of the day (morning, afternoon, evening or night), to see which parts of Jacksonville are busy. We also count activity in place discussions. Only totals are kept. Your exact location and your account are never part of them: a coded entry that can’t be traced back to you is kept for the rest of the month so you count once, then deleted, and the code’s key is destroyed. Small groups (fewer than 10 people) are never shown. You can turn this off in Account → Settings.',
      },
      {
        heading: 'Sharing',
        body: 'We don’t sell your personal information or show ads. We may share or sell area statistics (totals such as how many people used Jax in a ZIP code, or how active a place’s discussion is) to Jacksonville businesses and organizations; they never include who you are, your account, your posts or your location, and groups under 10 people are never included. Otherwise we share information only when the law requires it, for example a valid legal request or a mandatory report of child sexual abuse material.',
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
        heading: 'Posts in the right place',
        body: '• Area posts should matter to people nearby. A post mostly about one business belongs in that place’s discussion; a passing mention is fine.\n• Place discussions are for that place. Only review places you’ve actually been to, and never post fake reviews.\n• Don’t single out staff or customers by name, description or photo.\n• Don’t repeat the same post or comment across the app, and don’t pile on or reply just to provoke.\n• No sexual, explicit or graphic violent content anywhere. If someone is in danger, call 911 first.',
      },
      {
        heading: 'Photos, voice and video',
        body: '• Post only what you took or have the right to share: no copyrighted images, videos or music you don’t own.\n• Don’t post close-ups or video of people who didn’t agree to it, especially children.\n• Don’t show license plates, house numbers, the inside of someone’s home, or screenshots of private messages.\n• Don’t record other people’s conversations without them knowing.',
      },
      {
        heading: 'Places and voting',
        body: '• Suggest only real public places, never private homes or addresses, and no joke entries or duplicates. Keep ads and contact details out of names and notes.\n• Vote only on what you can see for yourself. Don’t vote to remove a place because of a bad experience or against a competitor, and don’t ask others to mass-vote.',
      },
      {
        heading: 'Profiles, friends and messages',
        body: '• No phone numbers, addresses, emails or social handles in your username or bio, and no pretending to be someone else, a business, the city or the police.\n• No offensive, hateful or explicit usernames, bios or photos.\n• Send friend requests only to people you know or have talked with; repeated unwanted requests are harassment.\n• In messages: no unwanted explicit images or messages, no scams, and no asking for money, passwords or personal details. Stop if someone doesn’t reply.',
      },
      {
        heading: 'Businesses',
        body: 'Owners can verify their business and get an Owner tag on their posts in its discussion. If you own or work at a place, say so when you post about it. Repeated promotions or ads aren’t allowed, and a verified owner who misuses the tag loses it. Staff who aren’t owners just say “I work here”; there is no tag for staff.',
      },
      {
        heading: 'What happens',
        body: 'Content that breaks these rules is removed. Accounts get a warning, then temporary suspensions, then a permanent ban. Serious cases may skip steps. Child sexual abuse material is reported to the authorities.',
      },
      {
        heading: 'Help keep it good',
        body: 'Use Report on anything that breaks these rules, and Block anyone you don’t want to see. Reports are reviewed by people, not just software. Don’t report just because you disagree, organize group reports, or report from several accounts: misusing reports is against the rules.',
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
        body: 'Exact location readings are saved only for actions that add or change something, and are deleted after 30 days. Readings used only to show you content are never saved. For area statistics, only your ZIP code and the part of the day are noted, under a code that can’t be traced back to you; these entries are deleted after the month (sooner for weekly counts), and only totals are kept.',
      },
      {
        heading: 'Guest mode',
        body: 'Guests can browse without an account. Guests can only view; they can’t post, comment, vote or report. A guest session expires after 30 days without use. Data about an expired guest session is deleted after 180 days, except for banned guests, which are kept so the ban stays in effect.',
      },
      {
        heading: 'Deleting your account',
        body: 'When you delete your account, you are signed out everywhere, can’t sign in, and your profile disappears immediately. Your posts stay but show “deleted user.” Your encrypted email is kept for 30 days in case of abuse reports, then permanently destroyed, including in backups. If an account is part of a legal or safety investigation, its data may be kept longer, until the investigation ends.',
      },
      {
        heading: 'Moderation records',
        body: 'Moderation decisions and the admin activity log are kept for 3 years to keep enforcement consistent. Location flags (for example a location that changed impossibly fast) are deleted after 3 months.',
      },
      {
        heading: 'Posts and comments',
        body: 'Your posts and comments stay until you delete them. 30 days after you delete one, it is permanently erased, with its votes. Content removed by a moderator for breaking the rules is kept for 1 year as evidence, then erased. Nothing is erased while a report about it is still being reviewed. A deleted comment that others replied to stays as an empty “deleted” placeholder so the replies still make sense.',
      },
      {
        heading: 'Photos, voice and video',
        body: 'Uploads that never end up in a post or message are deleted after a day. Media removed by a moderator or rejected by our checks is deleted, file included, after 30 days.',
      },
      {
        heading: 'Messages and notifications',
        body: 'Private messages stay until you or the other person delete them. An unsent message is erased a day after it was unsent. Notifications are deleted 7 days after you read them, and after 30 days if you never do.',
      },
      {
        heading: 'Devices and support',
        body: 'The random ID the app gets when it is installed is deleted after a year without use (except on a banned device). Contact-us messages are deleted 2 years after they are resolved.',
      },
    ],
  },
};
