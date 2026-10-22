import { useLocalSearchParams } from 'expo-router';
import { PostDetail } from '@/discussion/PostDetail';

/** D115: one of your place posts, opened from your profile under Account. */
export default function AccountPlacePostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PostDetail kind="business" id={id} />;
}
