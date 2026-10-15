import { useLocalSearchParams } from 'expo-router';
import { ProfileScreen } from '@/profile/ProfileScreen';

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <ProfileScreen username={username} postPath="/post" />;
}
