import { useLocalSearchParams } from 'expo-router';
import { PostDetail } from '@/discussion/PostDetail';

/** D130: a citywide topic post, opened from the Citywide tab. */
export default function CitywidePostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PostDetail kind="general" id={id} />;
}
