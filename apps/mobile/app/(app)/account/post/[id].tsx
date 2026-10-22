import { useLocalSearchParams } from 'expo-router';
import { PostDetail } from '@/discussion/PostDetail';

/** D115: one of your area posts, opened from your profile under Account. */
export default function AccountGeneralPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PostDetail kind="general" id={id} />;
}
