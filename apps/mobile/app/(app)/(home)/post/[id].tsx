import { useLocalSearchParams } from 'expo-router';
import { PostDetail } from '@/discussion/PostDetail';

export default function GeneralPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PostDetail kind="general" id={id} />;
}
