import { z } from 'zod';
import { locationReadingSchema } from './location';

const reasonText = z.string().trim().min(3, 'Give a short reason').max(1000);

/** D218: live area chat. A line is plain text, at most this many characters. */
export const CHAT_MAX = 200;

/** Where am I and is the room open? (also keeps you counted as present in your room) */
export const chatStatusSchema = z.strictObject({ reading: locationReadingSchema });

/** Lines newer than `after` (an ISO time from the last line you saw); all of them without it. */
export const chatListSchema = z.strictObject({
  reading: locationReadingSchema,
  after: z.iso.datetime().optional(),
});

export const chatSendSchema = z.strictObject({
  reading: locationReadingSchema,
  body: z
    .string()
    .trim()
    .min(1, 'Write something first')
    .max(CHAT_MAX, `Keep it under ${CHAT_MAX} characters`)
    .refine(
      // eslint-disable-next-line no-control-regex
      (v) => !/[\u0000-\u001F\u007F]/.test(v),
      'Invalid characters',
    ),
});

/** Admin: switch a room on or off, or give it a name of your own (empty clears it). */
export const chatRoomAdminSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('enable'), reason: reasonText }),
  z.strictObject({ action: z.literal('disable'), reason: reasonText }),
  z.strictObject({
    action: z.literal('rename'),
    reason: reasonText,
    displayName: z.string().trim().max(80),
  }),
]);

/** Admin: lift someone's chat mute early. */
export const chatUnmuteSchema = z.strictObject({ reason: reasonText });

export interface ChatLine {
  id: string;
  username: string;
  /** Staff lines show in the admin color. */
  admin: boolean;
  createdAt: string;
  body: string;
}

export interface ChatRoomInfo {
  /** "Riverside", or "32204 N" when there is no name. */
  title: string;
  zip: string | null;
}

/** `open` is false (and `people` null) when chat is off here or too few people are about. */
export interface ChatStatus {
  open: boolean;
  /** When a mute ends (ISO time), or null. A muted person can read but not send. */
  mutedUntil: string | null;
  room: ChatRoomInfo | null;
  /** "a few" under 5 people, the number from 5. */
  people: string | null;
}
