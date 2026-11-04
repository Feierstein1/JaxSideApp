/** D188: plain words for giveaway and winner states in the portal. */
export const WINNER_STATUS: Record<string, { label: string; tone: 'ok' | 'alert' | 'muted' }> = {
  NOTIFIED: { label: 'waiting for answer', tone: 'muted' },
  ACCEPTED: { label: 'accepted: send prize', tone: 'alert' },
  DECLINED: { label: 'declined', tone: 'muted' },
  EXPIRED: { label: 'no answer in time', tone: 'muted' },
  PRIZE_SENT: { label: 'prize sent', tone: 'ok' },
  DISQUALIFIED: { label: 'disqualified', tone: 'muted' },
};

export const PHASE_TONE: Record<string, 'ok' | 'alert' | 'muted'> = {
  Upcoming: 'muted',
  Open: 'ok',
  Ended: 'alert',
  Completed: 'ok',
  Cancelled: 'muted',
};
