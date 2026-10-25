/**
 * D104 (Phase 11): first-time guides. A short guide shows the first time someone does each
 * action (once per account, D104 / Q18). Wording from docs/FIRST_TIME_GUIDES.md, updated to
 * what's built. Every rule here is also in the Community Guidelines (policies.ts).
 * Raise a guide's `version` when its rules change in an important way: it shows once more.
 */

export type GuidePageKind = 'do' | 'dont' | 'info';

export interface GuidePage {
  kind: GuidePageKind;
  items: string[];
}

export interface Guide {
  key: GuideKey;
  version: number;
  title: string;
  /** The last button. */
  done: string;
  pages: GuidePage[];
}

export const GUIDE_KEYS = [
  'areaPost',
  'placePost',
  'comment',
  'photo',
  'voice',
  'video',
  'placeSuggestion',
  'placeRemoval',
  'report',
  'profile',
  'friendRequest',
  'block',
  'guestWelcome',
  'message',
  'topicCreate', // D133
] as const;
export type GuideKey = (typeof GUIDE_KEYS)[number];

const PENALTIES = 'Breaking the rules can lead to a warning, then suspensions, then a ban.';
const MORE = 'Full rules: Account → Community rules.';

export const GUIDES: Record<GuideKey, Guide> = {
  areaPost: {
    key: 'areaPost',
    version: 1,
    title: 'Posting to your area',
    done: 'Got it, let’s post',
    pages: [
      {
        kind: 'do',
        items: [
          'Share what’s happening around here: events, news, things you noticed nearby.',
          'Ask your neighbors: recommendations, lost and found, “does anyone know…”.',
          'Give a heads-up: road closures, power outages, weather, safety notices.',
          'Keep it local: it should matter to people within a few blocks.',
          'Be kind and assume good intent.',
        ],
      },
      {
        kind: 'dont',
        items: [
          'Post mostly about one business. Reviews and detailed talk about a place go in that place’s discussion (a passing mention is fine).',
          'Bully, harass, threaten, or use racist, hateful or demeaning language.',
          'Share anyone’s personal information: addresses, phone numbers, license plates, photos of their home (doxxing).',
          'Post sexual, explicit or graphic violent content.',
          'Spam or advertise. And never post something dangerous or illegal: if someone is in danger, call 911 first.',
        ],
      },
      {
        kind: 'info',
        items: [
          'People see your username and photo, never your email or exact location. It’s your choice whether to tell anyone who you really are.',
          'Only people within your radius see area posts.',
          PENALTIES,
          MORE,
        ],
      },
    ],
  },
  placePost: {
    key: 'placePost',
    version: 1,
    title: 'Posting about a place',
    done: 'Got it, let’s post',
    pages: [
      {
        kind: 'do',
        items: [
          'Talk about this place: your experience, tips, what’s new, the best thing to order.',
          'Be honest and fair, good or bad.',
          'Share useful details: hours you noticed, parking, wait times, accessibility.',
          'Post while you’re actually near it. That’s what makes these discussions trustworthy.',
        ],
      },
      {
        kind: 'dont',
        items: [
          'Post fake reviews, or review a place you haven’t been to.',
          'Single out staff or other customers by name, description or photo.',
          'Post about unrelated topics. Those belong in the area feed.',
          'Advertise for a competitor, or post the same promotion over and over.',
          'Break any area post rule: no harassment, hate, explicit content or personal info.',
        ],
      },
      {
        kind: 'info',
        items: [
          'Place discussions open only within about 530 yards of the place.',
          'Own or work at this place? Say so in your post. Owners can get a verified Owner tag (“I own this place” on the place page). Repeated promotions aren’t allowed.',
        ],
      },
    ],
  },
  // D133: the first time someone starts a topic (city or near me).
  topicCreate: {
    key: 'topicCreate',
    version: 1,
    title: 'Starting a topic',
    done: 'Got it, let’s start one',
    pages: [
      {
        kind: 'do',
        items: [
          'Pick one clear subject people can add to over time: a game day, a new restaurant, a road project, a question for the city.',
          'Write a title that says what it’s about, and choose the right category.',
          'Choose City for things all of Jacksonville can join, or Near me for something happening right around you.',
          'Search first: if a topic already exists, post in it instead of starting another.',
        ],
      },
      {
        kind: 'dont',
        items: [
          'Start a topic about a private person, or one meant to pile on someone.',
          'Use a topic to advertise, or start the same one over and over.',
          'Put personal details in a title or description: names, addresses, phone numbers.',
          'Break any post rule: no harassment, hate, threats or explicit content.',
        ],
      },
      {
        kind: 'info',
        items: [
          'Near me topics are only for people within half a mile of where the topic was started. You have to be inside that area to see it, post in it, comment or vote.',
          'Topics can be reported like posts; ones that break the rules are removed.',
        ],
      },
    ],
  },
  comment: {
    key: 'comment',
    version: 1,
    title: 'Commenting',
    done: 'Got it',
    pages: [
      {
        kind: 'do',
        items: [
          'Add to the conversation: answer, agree or add something useful.',
          'Disagree with ideas, not people.',
        ],
      },
      {
        kind: 'dont',
        items: [
          'Insult, pile on, or reply just to provoke.',
          'Repeat the same comment across posts.',
          'Share anyone’s personal information.',
        ],
      },
      {
        kind: 'info',
        items: [
          'Commenting and voting need you within about 530 yards of the post.',
          'If a thread gets heated, you can leave it, or block someone without them being told.',
        ],
      },
    ],
  },
  photo: {
    key: 'photo',
    version: 1,
    title: 'Adding photos',
    done: 'Got it',
    pages: [
      {
        kind: 'do',
        items: ['Share photos you took of things around the area. GIFs are fine too.'],
      },
      {
        kind: 'dont',
        items: [
          'Post close-ups of people who didn’t agree to be photographed, especially children.',
          'Show license plates, house numbers, or screenshots of private messages.',
          'Post explicit, graphic or copyrighted images.',
        ],
      },
      {
        kind: 'info',
        items: [
          'Photos are cleaned of location and camera details before anyone sees them.',
          'Long-pressing a photo lets others report it.',
        ],
      },
    ],
  },
  voice: {
    key: 'voice',
    version: 1,
    title: 'Voice posts',
    done: 'Got it',
    pages: [
      {
        kind: 'do',
        items: ['Talk about what’s happening nearby, in your own voice. Up to 60 seconds.'],
      },
      {
        kind: 'dont',
        items: [
          'Record other people’s conversations without them knowing.',
          'Play music or other audio you don’t own.',
          'Say anything that would break the text rules. Voice posts are reviewed when someone reports them.',
        ],
      },
      {
        kind: 'info',
        items: [
          'Background sounds can give away where you are. Listen back before you post.',
          'Recordings are cleaned of location and device details.',
        ],
      },
    ],
  },
  video: {
    key: 'video',
    version: 1,
    title: 'Video posts',
    done: 'Got it',
    pages: [
      {
        kind: 'do',
        items: ['Share short videos you took around the area. Up to 30 seconds.'],
      },
      {
        kind: 'dont',
        items: [
          'Film people who didn’t agree to it, especially children.',
          'Show license plates, house numbers or the inside of someone’s home.',
          'Post explicit, graphic or copyrighted videos, or music you don’t own.',
        ],
      },
      {
        kind: 'info',
        items: [
          'Videos are cleaned of location and device details before anyone sees them.',
          'What’s in the picture and the sound can still show where you are. Check before you post.',
          'Video posts are reviewed when someone reports them.',
        ],
      },
    ],
  },
  placeSuggestion: {
    key: 'placeSuggestion',
    version: 1,
    title: 'Suggesting a place',
    done: 'Got it',
    pages: [
      {
        kind: 'do',
        items: [
          'Suggest real public places: businesses, parks, venues, community spots.',
          'Stand at the place when you suggest it. Your current location becomes its spot.',
          'Use the place’s real name and the closest matching category.',
          'Check the “Already listed nearby?” matches first.',
        ],
      },
      {
        kind: 'dont',
        items: [
          'Suggest private homes or people’s addresses.',
          'Suggest places that don’t exist, joke entries, or duplicates.',
          'Put ads or contact details in the name or notes.',
        ],
      },
      {
        kind: 'info',
        items: [
          'People nearby vote on it under “Verify changes near you”: 10 “It’s here” votes add it (yours counts first), 10 “Not here” votes drop it, and it expires after 60 days without a result.',
          'Added suggestions earn the Approved Contributor medal.',
          'Only the place’s location is saved with it, not yours.',
        ],
      },
    ],
  },
  placeRemoval: {
    key: 'placeRemoval',
    version: 1,
    title: 'Closed or doesn’t exist?',
    done: 'Got it',
    pages: [
      {
        kind: 'do',
        items: [
          'Vote when a place has closed for good, moved, or was never there.',
          'Be at or near the spot so you can see for yourself.',
        ],
      },
      {
        kind: 'dont',
        items: [
          'Vote to remove a place because you had a bad experience. Post about it instead.',
          'Vote against a competitor or a place you dislike.',
          'Ask others to mass-vote.',
        ],
      },
      {
        kind: 'info',
        items: [
          'You can vote once on each place, and you can’t change it after the few seconds to undo.',
          '10 “Closed” votes from people nearby take a place off Places; 10 “Still open” votes keep it.',
          'Every vote is kept with who voted, when and how far away. Admins review unusual voting and can restore a place; misuse counts as breaking the rules.',
        ],
      },
    ],
  },
  report: {
    key: 'report',
    version: 1,
    title: 'Reporting',
    done: 'Got it',
    pages: [
      {
        kind: 'do',
        items: [
          'Report posts, comments, photos, messages or profiles that break the Community Guidelines.',
          'Pick the closest reason and add details if they help.',
          'Block someone if you just don’t want to see them. That’s not what reports are for.',
        ],
      },
      {
        kind: 'dont',
        items: [
          'Report just because you disagree with someone.',
          'Organize group reports, or report the same thing from several accounts.',
          'Use reports to get back at someone. Misusing reports is against the rules.',
        ],
      },
      {
        kind: 'info',
        items: [
          'The person isn’t told who reported them. A moderator reviews reports, and you can follow yours in Account → My reports.',
          'If someone is in immediate danger, call 911.',
        ],
      },
    ],
  },
  profile: {
    key: 'profile',
    version: 1,
    title: 'Your profile',
    done: 'Got it',
    pages: [
      {
        kind: 'do',
        items: [
          'Pick a username and photo you’re comfortable with neighbors seeing.',
          'Keep your bio friendly. A line about your interests or neighborhood is plenty.',
        ],
      },
      {
        kind: 'dont',
        items: [
          'Put your phone number, address, email or social handles in your bio or name. It defeats the privacy that keeps you safe here.',
          'Pretend to be someone else, a business, the city, or the police.',
          'Use offensive, hateful or explicit names, bios or photos.',
        ],
      },
      {
        kind: 'info',
        items: [
          'Usernames can be changed once every 30 days, and your old name stays reserved for a while so no one can pretend to be you.',
          'Your bio, photo, username and color are visible to anyone who opens your profile.',
        ],
      },
    ],
  },
  friendRequest: {
    key: 'friendRequest',
    version: 1,
    title: 'Friends',
    done: 'Got it',
    pages: [
      {
        kind: 'info',
        items: [
          'Friends see “@you posted near [neighborhood]” or “at [place]” in their friends feed, and which places you’ve favorited. They never see the post itself unless they’re nearby.',
          'You can hide your recent posts from friends in Account → “Hide my posts from friends”.',

          'Only send requests to people you know or have talked with. Repeated unwanted requests count as harassment.',
        ],
      },
    ],
  },
  block: {
    key: 'block',
    version: 1,
    title: 'Blocking',
    done: 'Got it',
    pages: [
      {
        kind: 'info',
        items: [
          'They won’t see your profile, and you won’t see their posts or comments. Friendship and messages stop.',
          'They aren’t told.',
          'Undo it any time in Account → Blocked users.',
          'Blocking doesn’t report them. If they broke a rule, report them too.',
        ],
      },
    ],
  },
  guestWelcome: {
    key: 'guestWelcome',
    version: 1,
    title: 'Welcome, guest',
    done: 'Got it',
    pages: [
      {
        kind: 'info',
        items: [
          'As a guest you can read posts and comments nearby.',
          'Posting, commenting, voting, reporting and place discussions need a free account.',
          'Your guest session ends after a while without use.',
        ],
      },
    ],
  },
  message: {
    key: 'message',
    version: 1,
    title: 'Private messages',
    done: 'Got it',
    pages: [
      {
        kind: 'do',
        items: ['Message your friends: follow-ups, plans, questions.'],
      },
      {
        kind: 'dont',
        items: [
          'Send unwanted explicit images or messages, or keep messaging someone who hasn’t replied.',
          'Scam, sell or ask for money, passwords or personal details.',
          'Share screenshots of other people’s private messages.',
        ],
      },
      {
        kind: 'info',
        items: [
          'Only friends can message each other. Long-press a message to unsend it (15 minutes), delete it for you, or report it.',
          'Moderators can read a message only if someone in the chat reports it.',
          'Meeting someone in person? Pick a public place and tell a friend.',
        ],
      },
    ],
  },
};
