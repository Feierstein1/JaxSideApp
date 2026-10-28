import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import { router } from 'expo-router';
import { categoryGroup, DARK, type PlaceSummary } from '@jax/shared';
import { API_BASE_URL, api } from '@/api';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';

// react-native-webview 14 types default the props generic to `undefined`, which turns
// every prop into `never`; pin it to "no extra props".
const WebView = RNWebView<object>;

/** D145: refit the view once you're this far from where it was last framed. */
const REFIT_METERS = 200;

/** Straight-line distance in meters (short distances; equirectangular is plenty). */
function metersBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  const x = (b.longitude - a.longitude) * rad * Math.cos(((a.latitude + b.latitude) / 2) * rad);
  const y = (b.latitude - a.latitude) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/**
 * D99: the Places map. A free MapLibre map of Duval (Protomaps / OpenStreetMap tiles from
 * our own server) in a WebView, with your places as their category icons in the category
 * colors (D113) and your location in teal. Tap a place for a pop-up with its posts and
 * favorites; tap again to open it. No Google, no keys, no fees. Map tiles are kept on the
 * phone for a week (D113).
 */
export function PlacesMap({
  places,
  me,
}: {
  places: PlaceSummary[];
  me: { latitude: number; longitude: number } | null;
}) {
  const [pageUrl, setPageUrl] = useState<string | null>();
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);
  const web = useRef<InstanceType<typeof WebView>>(null);
  // D145: where the view was last fitted to; it refits when you've moved since.
  const fittedAt = useRef<{ latitude: number; longitude: number } | null>(null);
  const latest = useRef({ places, me });
  latest.current = { places, me };

  useEffect(() => {
    api
      .get<{ available: boolean; pageUrl?: string }>('/api/v1/map')
      .then((r) => {
        setPageUrl(r.available && r.pageUrl ? `${API_BASE_URL}${r.pageUrl}` : null);
      })
      .catch(() => setError('Couldn’t load the map.'));
  }, []);

  /** Sends places and your location to the map; `fit` frames you and the places again. */
  function send(fit: boolean) {
    const { places: list, me: at } = latest.current;
    const data = {
      places: list.map((p) => ({
        id: p.id,
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        icon: categoryGroup(p.category),
        posts: p.postCount,
        favorites: p.favoriteCount,
      })),
      me: at,
      fit,
    };
    if (fit && at) fittedAt.current = at;
    web.current?.injectJavaScript(`window.jaxSetData(${JSON.stringify(data)}); true;`);
  }

  // Whenever places or your location change: fit the view the first time, and again once
  // you've moved (D145: reopening the app somewhere new used to keep the old view).
  useEffect(() => {
    if (!ready) return;
    const last = fittedAt.current;
    const moved = !last || (me ? metersBetween(last, me) > REFIT_METERS : false);
    send(moved);
    // send() reads the latest places and location from a ref.
  }, [ready, places, me]);

  /** D145: the Re-center button: back to you and the places around you. */
  function recenter() {
    send(true);
  }

  /** Android / iOS may stop the map's web view in the background: reload it. */
  function restart() {
    setReady(false);
    fittedAt.current = null;
    web.current?.reload();
  }

  function onMessage(e: WebViewMessageEvent) {
    let msg: { type?: string; id?: string; message?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      setReady(true);
    } else if (msg.type === 'open' && typeof msg.id === 'string') {
      router.push(`/places/${msg.id}`);
    } else if (msg.type === 'error') {
      if (!ready) setError('The map couldn’t start. Try the list.');
    }
  }

  if (error || pageUrl === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.lg }}>
        <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
          {error ?? 'The map isn’t set up on this server yet. Use the list for now.'}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      {pageUrl ? (
        <WebView
          ref={web}
          source={{ uri: pageUrl }}
          onMessage={onMessage}
          originWhitelist={['*']}
          javaScriptEnabled
          // Only our map page; links never open inside the map.
          onShouldStartLoadWithRequest={(r) => r.url.startsWith(API_BASE_URL)}
          onError={() => setError('The map couldn’t load. Try the list.')}
          setSupportMultipleWindows={false}
          onRenderProcessGone={restart}
          onContentProcessDidTerminate={restart}
          style={{ flex: 1, backgroundColor: DARK.page }}
          accessibilityLabel="Map of places near you"
        />
      ) : null}
      {ready ? (
        // D145: back to the starting view after panning or zooming around.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Re-center the map on you"
          onPress={recenter}
          style={({ pressed }) => ({
            position: 'absolute',
            top: SPACE.md,
            right: SPACE.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            height: 40,
            paddingHorizontal: 14,
            borderRadius: 20,
            backgroundColor: DARK.bar,
            borderWidth: 1,
            borderColor: DARK.hairline,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name="locate" size={18} color={DARK.accent} />
          <Text style={{ fontWeight: '800', fontSize: 14 }}>Re-center</Text>
        </Pressable>
      ) : null}
      {!ready ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator color={DARK.accent} />
        </View>
      ) : null}
    </View>
  );
}
