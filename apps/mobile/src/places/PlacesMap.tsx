import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { router } from 'expo-router';
import { categoryColor, DARK, type PlaceSummary } from '@jax/shared';
import { API_BASE_URL, api } from '@/api';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';

/**
 * D99: the Places map. A free MapLibre map of Duval (Protomaps / OpenStreetMap tiles from
 * our own server) in a WebView, with your places as dots in their category colors and
 * your location in gold. Tap a dot to open the place. No Google, no keys, no fees.
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
  const web = useRef<WebView>(null);
  const fitted = useRef(false);

  useEffect(() => {
    api
      .get<{ available: boolean; pageUrl?: string }>('/api/v1/map')
      .then((r) => setPageUrl(r.available && r.pageUrl ? `${API_BASE_URL}${r.pageUrl}` : null))
      .catch(() => setError('Couldn’t load the map.'));
  }, []);

  // Send places and your location in whenever they change (fit the view the first time).
  useEffect(() => {
    if (!ready) return;
    const data = {
      places: places.map((p) => ({
        id: p.id,
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        color: categoryColor(p.category),
      })),
      me,
      fit: !fitted.current,
    };
    fitted.current = true;
    web.current?.injectJavaScript(`window.jaxSetData(${JSON.stringify(data)}); true;`);
  }, [ready, places, me]);

  function onMessage(e: WebViewMessageEvent) {
    let msg: { type?: string; id?: string; message?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'open' && typeof msg.id === 'string') router.push(`/places/${msg.id}`);
    else if (msg.type === 'error' && !ready) setError('The map couldn’t start. Try the list.');
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
          setSupportMultipleWindows={false}
          style={{ flex: 1, backgroundColor: DARK.page }}
          accessibilityLabel="Map of places near you"
        />
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
