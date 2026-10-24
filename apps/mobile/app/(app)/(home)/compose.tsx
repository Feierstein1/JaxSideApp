import { useLocalSearchParams } from 'expo-router';
import { Compose } from '@/discussion/Compose';

/** A new area post, or (D125) a post in a citywide topic when opened with its ID. */
export default function ComposeGeneral() {
  const { topicId, topicTitle } = useLocalSearchParams<{ topicId?: string; topicTitle?: string }>();
  return <Compose target={{ kind: 'general', topicId, topicTitle }} />;
}
