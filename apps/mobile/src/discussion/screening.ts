import { ApiRequestError } from '@/api/client';
import { showAlert } from '@/dialog';

/** P5.4: the server saved the content but a moderator reviews it before others see it. */
export interface HeldResponse {
  held: true;
  message: string;
}
export const isHeld = (r: unknown): r is HeldResponse =>
  typeof r === 'object' && r !== null && (r as { held?: unknown }).held === true;

function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    showAlert(
      'Before you post',
      `${message}\n\nPost anyway?`,
      [
        { text: 'Edit it', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Post anyway', onPress: () => resolve(true) },
      ],
      { icon: 'chatbubble-ellipses-outline', tone: 'warning' },
    );
  });
}

/**
 * Sends text through the server's screening (P5.4, §11.2). A warning becomes a
 * "Post anyway?" prompt; held content gets a notice. Returns null if the person chose
 * to edit instead. Blocked content throws like any other error, with the reason.
 */
export async function sendScreened<T>(
  send: (confirmWarning?: true) => Promise<T>,
): Promise<T | null> {
  let result: T;
  try {
    result = await send();
  } catch (e) {
    if (!(e instanceof ApiRequestError) || e.code !== 'CONTENT_WARNING') throw e;
    if (!(await confirm(e.message))) return null;
    result = await send(true);
  }
  if (isHeld(result))
    showAlert('Sent for review', result.message, undefined, { icon: 'eye-outline', tone: 'info' });
  return result;
}
