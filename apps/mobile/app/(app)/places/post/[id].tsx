import { useLocalSearchParams } from 'expo-router';
import { PostDetail } from '@/discussion/PostDetail';

export default function BusinessPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PostDetail kind="business" id={id} />;
}
