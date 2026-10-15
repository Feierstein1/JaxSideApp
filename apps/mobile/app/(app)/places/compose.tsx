import { useLocalSearchParams } from 'expo-router';
import { Compose } from '@/discussion/Compose';

export default function ComposeInPlace() {
  const { placeId, placeName } = useLocalSearchParams<{ placeId: string; placeName?: string }>();
  return <Compose target={{ kind: 'business', placeId }} placeName={placeName} />;
}
