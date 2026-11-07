import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';
import { shouldReset } from '@/idle-rule';
import { reloadLists } from '@/location/device';

/**
 * D217: open the app after 20+ minutes and a place, post or topic page you left open is
 * closed (back to the list it came from) and Home and Places reload. You've probably moved,
 * and the old room may be out of reach. Shorter breaks change nothing here; moving more than
 * about 50 m already reloads the lists (D73).
 */
export function useIdleReset() {
  const pathname = usePathname();
  useEffect(() => {
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        leftAt ??= Date.now();
        return;
      }
      const away = leftAt === null ? 0 : Date.now() - leftAt;
      leftAt = null;
      if (!shouldReset(away, pathname)) return;
      try {
        if (router.canDismiss()) router.dismissAll();
      } catch {
        // already on a list screen
      }
      reloadLists();
    });
    return () => sub.remove();
  }, [pathname]);
}
