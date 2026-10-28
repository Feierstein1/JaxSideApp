import { useLocalSearchParams } from 'expo-router';
import { PostDetail } from '@/discussion/PostDetail';

export default function GeneralPostScreen() {
  const { id, comment } = useLocalSearchParams<{ id: string; comment?: string }>();
  return <PostDetail kind="general" id={id} focusCommentId={comment} />;
}
