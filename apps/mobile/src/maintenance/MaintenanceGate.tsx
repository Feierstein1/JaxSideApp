import { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { api, onMaintenance } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';

/** D246: how often the maintenance screen asks whether it is over. */
const CHECK_MS = 15_000;

interface Status {
  on: boolean;
  text: string;
  message: string | null;
}

/**
 * D246: the emergency switch. When the server answers any request with 503 MAINTENANCE, this
 * covers the whole app ("JaxSide is currently having maintenance done"). It can't be closed;
 * it checks every 15 s and goes away on its own once the switch is off. Everyone was signed
 * out by the server, so the app then asks them to sign in again.
 */
export function MaintenanceGate() {
  const { refresh } = useAuth();
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => onMaintenance((message) => setShown(message || '')), []);

  useEffect(() => {
    if (shown === null) return;
    let cancelled = false;
    const check = async () => {
      try {
        const s = await api.get<Status>('/api/v1/maintenance');
        if (cancelled) return;
        if (s.on) setShown(s.message ?? s.text);
        else {
          setShown(null);
          void refresh(); // ends in sign-in: the server signed everyone out
        }
      } catch {
        // offline: keep showing the screen and try again
      }
    };
    const t = setInterval(() => void check(), CHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [shown, refresh]);

  return (
    <Modal
      visible={shown !== null}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      // Back does nothing: the only way out is the switch going off.
      onRequestClose={() => undefined}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.sm,
          padding: SPACE.lg,
          backgroundColor: DARK.page,
        }}
      >
        <Ionicons name="construct-outline" size={56} color={DARK.accent} />
        <Text accessibilityRole="header" style={[TYPE.title, { textAlign: 'center' }]}>
          JaxSide is currently having maintenance done.
        </Text>
        <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
          {shown && shown !== 'JaxSide is currently having maintenance done.'
            ? shown
            : 'Please check back soon.'}
        </Text>
      </View>
    </Modal>
  );
}
