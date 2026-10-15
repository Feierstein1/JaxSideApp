import { Stack, useLocalSearchParams } from 'expo-router';
import { POLICIES, type PolicyKey } from '@jax/shared';
import { PolicyView } from '@/policy/PolicyView';

export default function PolicyScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return (
    <>
      <Stack.Screen options={{ title: POLICIES[key as PolicyKey]?.title ?? 'Policy' }} />
      <PolicyView policyKey={key} />
    </>
  );
}
