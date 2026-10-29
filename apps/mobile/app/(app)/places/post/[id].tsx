import { useLocalSearchParams } from 'expo-router';
import { PostDetail } from '@/discussion/PostDetail';

export default function BusinessPostScreen() {
  const { id, comment } = useLocalSearchParams<{ id: string; comment?: string }>();
  return <PostDetail kind="business" id={id} focusCommentId={comment} />;
}
