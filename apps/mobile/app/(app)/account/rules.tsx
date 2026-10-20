import { GUIDES, type GuideKey } from '@jax/shared';
import { reviewGuide } from '@/guides/guide';
import { ListGroup, ListRow, PageTitle, Screen, type IconName } from '@/ui';

const GROUPS: { title: string; items: { key: GuideKey; icon: IconName }[] }[] = [
  {
    title: 'Posting',
    items: [
      { key: 'areaPost', icon: 'location-outline' },
      { key: 'placePost', icon: 'storefront-outline' },
      { key: 'comment', icon: 'chatbubble-outline' },
      { key: 'photo', icon: 'image-outline' },
      { key: 'voice', icon: 'mic-outline' },
      { key: 'video', icon: 'videocam-outline' },
    ],
  },
  {
    title: 'Places',
    items: [
      { key: 'placeSuggestion', icon: 'add-circle-outline' },
      { key: 'placeRemoval', icon: 'close-circle-outline' },
    ],
  },
  {
    title: 'People',
    items: [
      { key: 'profile', icon: 'person-circle-outline' },
      { key: 'friendRequest', icon: 'people-outline' },
      { key: 'message', icon: 'mail-outline' },
      { key: 'block', icon: 'ban-outline' },
      { key: 'report', icon: 'flag-outline' },
      { key: 'guestWelcome', icon: 'walk-outline' },
    ],
  },
];

/** D104: read any first-time guide again. The full rules are the Community Guidelines. */
export default function CommunityRules() {
  return (
    <Screen>
      <PageTitle
        title="Community rules"
        subtitle="The short guides shown the first time you do each thing. Tap one to read it again."
        icon="school-outline"
      />
      {GROUPS.map((g, i) => (
        <ListGroup key={g.title} title={g.title} first={i === 0}>
          {g.items.map((it) => (
            <ListRow
              key={it.key}
              icon={it.icon}
              label={GUIDES[it.key].title}
              onPress={() => reviewGuide(it.key)}
            />
          ))}
        </ListGroup>
      ))}
      <ListGroup footer="Everything in these guides is part of the Community Guidelines.">
        <ListRow
          icon="document-text-outline"
          label="Full Community Guidelines"
          href="/account/legal/guidelines"
        />
      </ListGroup>
    </Screen>
  );
}
