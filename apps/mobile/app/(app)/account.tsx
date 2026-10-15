import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { COLORS, CONFIG_DEFAULTS } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { categoryLabel } from '@/format';
import { Button, styles } from '@/ui';

const GENERAL_OPTIONS = [0.25, 0.5, 0.75, 1];
const BUSINESS_OPTIONS = [0.1, 0.2, 0.3];

interface Favorite {
  id: string;
  name: string;
  category: string;
}

/** P2.15 radius preferences, P2.14 favorites, and sign-out. No location needed here (D16). */
export default function AccountScreen() {
  const { state, signOut, refresh } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [error, setError] = useState<string>();

  const loadFavorites = useCallback(async () => {
    try {
      setFavorites((await api.get<{ favorites: Favorite[] }>('/api/v1/me/favorites')).favorites);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load favorites.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void loadFavorites();
    }, [loadFavorites]),
  );

  if (state.status !== 'signedIn') return null;
  const { user } = state;
  const general = user.generalRadiusMiles ?? CONFIG_DEFAULTS['radius.general.defaultMiles'];
  const business = user.businessRadiusMiles ?? CONFIG_DEFAULTS['radius.business.defaultMiles'];

  async function setRadius(field: 'generalRadiusMiles' | 'businessRadiusMiles', miles: number) {
    try {
      await api.patch('/api/v1/me/preferences', { [field]: miles });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t save.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{user.username}</Text>
      <Text style={styles.muted}>{user.email} (private)</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={[styles.label, { marginTop: 20 }]}>Feed radius</Text>
      <Options
        values={GENERAL_OPTIONS}
        selected={general}
        onPick={(v) => setRadius('generalRadiusMiles', v)}
      />
      <Text style={[styles.label, { marginTop: 12 }]}>Business discussions radius</Text>
      <Options
        values={BUSINESS_OPTIONS}
        selected={business}
        onPick={(v) => setRadius('businessRadiusMiles', v)}
      />

      <Text style={[styles.label, { marginTop: 20 }]}>Favorite places</Text>
      {favorites.length === 0 ? (
        <Text style={styles.muted}>Save places from the Places tab.</Text>
      ) : (
        favorites.map((f) => (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            onPress={() => router.push(`/places/${f.id}`)}
            style={{ paddingVertical: 8 }}
          >
            <Text style={styles.linkText}>
              ★ {f.name} <Text style={styles.muted}>· {categoryLabel(f.category)}</Text>
            </Text>
          </Pressable>
        ))
      )}

      <View style={{ marginTop: 24 }}>
        <Button title="Sign out" onPress={signOut} />
      </View>
    </ScrollView>
  );
}

function Options({
  values,
  selected,
  onPick,
}: {
  values: number[];
  selected: number;
  onPick: (v: number) => void;
}) {
  return (
    <View style={[styles.row, { flexWrap: 'wrap' }]}>
      {values.map((v) => {
        const active = Math.abs(v - selected) < 1e-9;
        return (
          <Pressable
            key={v}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onPick(v)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: active ? COLORS.accent : COLORS.border,
              backgroundColor: active ? COLORS.accent : COLORS.background,
            }}
          >
            <Text style={{ color: active ? COLORS.onAccent : COLORS.text, fontWeight: '600' }}>
              {v} mi
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
