import { useState, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CONFIG_DEFAULTS, DARK } from '@jax/shared';
import { useGuest } from '@/auth/guest';
import { haptic } from '@/motion';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Button, Chip, SearchField, Sheet } from '@/ui';
import { filterCount, NO_FILTERS, type Filters } from './api';

/*
 * D230: the Events tab's search and filters. One shared copy, so a day's list (opened from
 * the calendar) uses the same filters as the tab.
 */

let current: Filters = NO_FILTERS;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useEventFilters(): [Filters, (f: Filters) => void] {
  const f = useSyncExternalStore(subscribe, () => current);
  const set = (next: Filters) => {
    current = next;
    listeners.forEach((l) => l());
  };
  return [f, set];
}

const NEARBY = CONFIG_DEFAULTS['events.nearbyMiles'];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: SPACE.sm }}>
      <Text style={[TYPE.label, { color: DARK.textMuted }]}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>{children}</View>
    </View>
  );
}

/** Search box and the Filters button (with how many are on), and the filter sheet. */
export function EventFilterBar() {
  const [f, setF] = useEventFilters();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(f.q ?? '');
  const { isGuest } = useGuest();
  const on = filterCount(f);
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <View style={{ flex: 1 }}>
          <SearchField
            compact
            value={q}
            onChangeText={(t) => {
              setQ(t);
              // Search as you type, once there's something to search for (or it's cleared).
              if (t.trim().length >= 2 || !t.trim()) setF({ ...f, q: t });
            }}
            placeholder="Search events"
            label="Search events"
            maxLength={60}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={on ? `Filters, ${on} on` : 'Filters'}
          onPress={() => {
            haptic.select();
            setOpen(true);
          }}
          hitSlop={6}
          style={{
            height: 40,
            paddingHorizontal: 12,
            borderRadius: 20,
            backgroundColor: on ? DARK.tealSoft : DARK.raised,
            borderWidth: on ? 1 : 0,
            borderColor: DARK.accent,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Ionicons name="options-outline" size={18} color={on ? DARK.accent : DARK.text} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: on ? DARK.accent : DARK.text }}>
            {on ? `Filters · ${on}` : 'Filters'}
          </Text>
        </Pressable>
      </View>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filter events">
        <View style={{ gap: SPACE.lg }}>
          <Group title="Where">
            <Chip
              label="All of Duval"
              active={!f.nearby}
              onPress={() => setF({ ...f, nearby: false })}
            />
            <Chip
              label={`Within ${NEARBY} miles`}
              icon="navigate-outline"
              active={!!f.nearby}
              onPress={() => setF({ ...f, nearby: true })}
            />
          </Group>
          <Group title="Who puts it on">
            <Chip
              label="Everyone"
              active={f.kind === 'all'}
              onPress={() => setF({ ...f, kind: 'all' })}
            />
            <Chip
              label="Community"
              icon="people-outline"
              active={f.kind === 'community'}
              onPress={() => setF({ ...f, kind: 'community' })}
            />
            <Chip
              label="Businesses"
              icon="storefront-outline"
              active={f.kind === 'business'}
              onPress={() => setF({ ...f, kind: 'business' })}
            />
          </Group>
          <Group title="Setting">
            <Chip
              label="Any"
              active={!f.setting}
              onPress={() => setF({ ...f, setting: undefined })}
            />
            <Chip
              label="Indoor"
              icon="home-outline"
              active={f.setting === 'indoor'}
              onPress={() => setF({ ...f, setting: 'indoor' })}
            />
            <Chip
              label="Outdoor"
              icon="sunny-outline"
              active={f.setting === 'outdoor'}
              onPress={() => setF({ ...f, setting: 'outdoor' })}
            />
          </Group>
          <Group title="More">
            <Chip
              label="Free only"
              icon="pricetag-outline"
              active={!!f.freeOnly}
              onPress={() => setF({ ...f, freeOnly: !f.freeOnly })}
            />
            {isGuest ? null : (
              <Chip
                label="Events I follow"
                icon="bookmark-outline"
                active={!!f.following}
                onPress={() => setF({ ...f, following: !f.following })}
              />
            )}
          </Group>
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Button
              variant="secondary"
              title="Clear filters"
              onPress={() => setF({ ...NO_FILTERS, q: f.q })}
              style={{ flex: 1 }}
            />
            <Button title="Done" onPress={() => setOpen(false)} style={{ flex: 1 }} />
          </View>
        </View>
      </Sheet>
    </>
  );
}
