import { useAuth } from '@/auth/AuthContext';
import { ProfileScreen } from '@/profile/ProfileScreen';

/**
 * D115: your own profile, opened from Account → View. It lives in the Account tab, so Back
 * returns to Account, and your posts open here too (Back returns to this list).
 */
export default function MyProfileScreen() {
  const { state } = useAuth();
  if (state.status !== 'signedIn') return null;
  return (
    <ProfileScreen
      username={state.user.username}
      postPath="/account/post"
      placePostPath="/account/place-post"
    />
  );
}
