import { useLocalSearchParams } from 'expo-router';
import { Compose } from '@/discussion/Compose';

/** D125 / D130: a new post in a citywide topic. */
export default function ComposeCitywide() {
  const { topicId, topicTitle } = useLocalSearchParams<{ topicId?: string; topicTitle?: string }>();
  return <Compose target={{ kind: 'general', topicId, topicTitle }} />;
}
