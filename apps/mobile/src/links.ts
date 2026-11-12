import { Linking } from 'react-native';
import { showAlert } from '@/dialog';

/** "www.boldbean.com" from a link, for the leaving notice. */
export function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * D216 / D236: an ad's or an event's link opens the phone's browser, only after saying where
 * it goes. `onOpen` counts the tap.
 */
export function openOutsideLink(url: string, onOpen: () => void) {
  showAlert(
    'You’re leaving JaxSide',
    `This opens ${hostOf(url)} in your browser.`,
    [
      { text: 'Stay here', style: 'cancel' },
      {
        text: 'Open',
        onPress: () => {
          onOpen();
          void Linking.openURL(url);
        },
      },
    ],
    { icon: 'open-outline', tone: 'info' },
  );
}
