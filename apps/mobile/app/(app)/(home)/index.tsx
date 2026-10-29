import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { DARK, type PostTypeFilter } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { fetchFeed } from '@/discussion/api';
import { AreaStrip } from '@/location/AreaLabel';
import { getFreshReading, noteListLoad, useReloadWhenMoved } from '@/location/device';
import { PostList } from '@/discussion/PostList';
import { PostTypeTabs } from '@/discussion/PostTypeTabs';
import { StepEdge } from '@/deco';
import { HomeSlot } from '@/home/HomeSlot';
import { refreshLimiter } from '@/refresh-limit';
import { Banner, FloatingButton, RefreshButton, SearchField, SectionTitle } from '@/ui';
import { showAlert } from '@/dialog';

/** P3.11: the default landing screen, the feed for the area around you. */
export default function HomeFeed() {
  const { state } = useAuth();
  const [type, setType] = useState<PostTypeFilter>('all'); // D75
  const [area, setArea] = useState<string | null>(null);
  // D73: reload on the refresh button, or when the app is reopened somewhere new.
  const [reloads, setReloads] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const reload = () => setReloads((n) => n + 1);
  useReloadWhenMoved(reload);
  async function refresh() {
    const wait = refreshLimiter.tap(); // D74: 30 a minute
    if (wait) {
      showAlert('Slow down a little', `You can refresh again in ${wait} s.`, undefined, {
        icon: 'hourglass-outline',
        tone: 'warning',
      });
      return;
    }
    setRefreshing(true);
    try {
      await getFreshReading({ fresh: true }); // a new fix, not the cached one
    } catch {
      // the list shows the location error
    } finally {
      setRefreshing(false);
      reload();
    }
  }
  // D74: search by username or text; waits a moment while typing, needs 2+ characters.
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim().length >= 2 ? typed.trim() : ''), 400);
    return () => clearTimeout(t);
  }, [typed]);
  const load = useCallback(
    async (cursor?: string) => {
      // D140: Home is always newest first (no Latest / Top switch).
      const page = await fetchFeed('new', cursor, q || undefined, type);
      if (!cursor) {
        setArea(page.area ?? null); // D72: refreshed with the first page
        noteListLoad(); // D77: where this list is from
      }
      return page;
    },
    [q, type],
  );
  const verified = state.status === 'signedIn' && state.user.emailVerified;
  const { isGuest, promptAccount } = useGuest();
  const guest = state.status === 'guest' ? state.guest : undefined;

  function compose() {
    if (isGuest) return promptAccount('start a post'); // P4.2
    if (!verified) {
      showAlert(
        'Confirm your email first',
        'Enter the 6-digit code from your email in Account.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Go to Account', onPress: () => router.push('/account') },
        ],
        { icon: 'mail-unread-outline', tone: 'info' },
      );
      return;
    }
    router.push('/compose');
  }

  // D78 / D79: notices and the NEAR YOU line sit at the top of the list and scroll away with
  // it, so the feed gets the screen; where you are, search and the type tabs stay put.
  const listHeader = (
    <View style={{ paddingHorizontal: 12, paddingTop: 0, paddingBottom: 2, gap: 6 }}>
      {guest?.expiringSoon ? (
        <Banner icon="time-outline" style={{ marginBottom: 0 }}>
          {`Your guest session ends in ${guest.daysLeft} ${guest.daysLeft === 1 ? 'day' : 'days'} unless you use JaxSide before then.`}
        </Banner>
      ) : null}
      {/* D129 / D140: the art deco heading, centered, with the refresh button at the far
          right of the same line (an equal space on the left keeps the title centered). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -2 }}>
        <View style={{ width: 30 }} />
        <View style={{ flex: 1 }}>
          <SectionTitle center>Near you</SectionTitle>
        </View>
        <RefreshButton size={30} onPress={() => void refresh()} busy={refreshing} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      {/* D79 / D126 / D128: one black block under the header: the poll or Citywide first
          (right under JAXSIDE), then where you are, search and the type tabs, evenly spaced. */}
      {/* D132: tighter spacing so the posts start higher. */}
      <View style={{ backgroundColor: DARK.bar, paddingHorizontal: 12, paddingTop: 4, gap: 5 }}>
        {/* D126: the poll, or once answered Citywide topics (hidden while searching). */}
        {q ? null : <HomeSlot reloadKey={String(reloads)} />}
        <AreaStrip area={area} label="Your area" />
        <SearchField
          label="Search posts"
          placeholder="Search posts or @username"
          value={typed}
          onChangeText={setTyped}
          maxLength={50}
          compact
        />
        <PostTypeTabs value={type} onChange={setType} />
      </View>
      {/* D127: the icon's stepped edge. */}
      <StepEdge />
      <PostList
        load={load}
        reloadKey={`${reloads}:${q}:${type}`}
        onOpen={(p) => router.push(`/post/${p.id}`)}
        header={listHeader}
        emptyIcon={q ? 'search-outline' : type === 'voice' ? 'mic-outline' : 'chatbubbles-outline'}
        emptyTitle={
          q
            ? `No posts nearby match “${q}”`
            : type !== 'all'
              ? `No ${type} posts nearby yet`
              : 'It’s quiet around here'
        }
        emptyBody={
          q
            ? 'Try different words, or a @username.'
            : 'Be the first to share what’s happening nearby. People within your radius will see it.'
        }
        emptyAction={q ? undefined : { label: 'Start a post', onPress: compose }}
        fab={<FloatingButton label="Write a new post" onPress={compose} />}
      />
    </View>
  );
}
