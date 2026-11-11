import { APP_TIME_ZONE } from './constants';

/*
 * D230: event dates and times are Jacksonville wall-clock times (America/New_York). These
 * helpers turn "2026-11-14" + "19:30" into the right instant across daylight-saving changes,
 * and back. Dates are plain 'YYYY-MM-DD' strings, times 'HH:MM' (24-hour).
 */

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function wallClock(ms: number) {
  const p: Record<string, number> = {};
  for (const part of PARTS.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return {
    year: p.year!,
    month: p.month!,
    day: p.day!,
    // Some engines print midnight as 24 even with h23.
    hour: p.hour === 24 ? 0 : p.hour!,
    minute: p.minute!,
    second: p.second!,
  };
}

/** Minutes Jacksonville is ahead of UTC at this instant (-300 in winter, -240 in summer). */
function offsetMinutes(ms: number) {
  const w = wallClock(ms);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

const pad = (n: number) => String(n).padStart(2, '0');

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A real calendar date (rejects 2026-02-30). */
export function isValidDate(date: string) {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * The instant for a Jacksonville date and time. A time skipped by the spring change
 * (2:30 on that Sunday) lands an hour later, as clocks do.
 */
export function localToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMinutes(guess) * 60_000;
  const second = guess - offsetMinutes(first) * 60_000;
  const wanted = `${date} ${time}`;
  const reads = (ms: number) => `${localDate(ms)} ${localTime(ms)}`;
  // The earlier match when the time happens twice (fall back); in the spring gap neither
  // matches, so the later instant (clocks already moved forward).
  const matches = [first, second].filter((ms) => reads(ms) === wanted);
  return new Date(matches.length ? Math.min(...matches) : Math.max(first, second));
}

/** The Jacksonville date ('YYYY-MM-DD') of an instant. */
export function localDate(at: Date | string | number): string {
  const w = wallClock(new Date(at).getTime());
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** The Jacksonville time ('HH:MM') of an instant. */
export function localTime(at: Date | string | number): string {
  const w = wallClock(new Date(at).getTime());
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** Calendar arithmetic on a date string (no time zones involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** '2026-11' → '2026-12' (or -1 for the month before). */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

/** Every date of a month, in order. */
export function daysOfMonth(month: string): string[] {
  const first = `${month}-01`;
  const out: string[] = [];
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * D230: a month as calendar weeks starting on Sunday; null fills the squares before the 1st
 * and after the last day, so every week has 7 equal squares.
 */
export function monthGrid(month: string): (string | null)[][] {
  const days = daysOfMonth(month);
  const cells: (string | null)[] = [...Array(weekdayOf(days[0]!)).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** One session as typed: a date, a start and an end. An end at or before the start is the next day. */
export interface SessionInput {
  date: string;
  start: string;
  end: string;
}

/** The session's start and end instants (an end at or before the start runs past midnight). */
export function sessionInstants(s: SessionInput): { startsAt: Date; endsAt: Date } {
  const startsAt = localToUtc(s.date, s.start);
  const endDate = s.end <= s.start ? addDays(s.date, 1) : s.date;
  return { startsAt, endsAt: localToUtc(endDate, s.end) };
}

/**
 * D230: the same session every week on the same weekday, from its date up to and including
 * `until` (weekly trivia, a Saturday market). At most `max` sessions.
 */
export function repeatWeekly(s: SessionInput, until: string, max = 60): SessionInput[] {
  const out: SessionInput[] = [];
  for (let d = s.date; d <= until && out.length < max; d = addDays(d, 7)) {
    out.push({ ...s, date: d });
  }
  return out;
}

/** "7:30 PM" from "19:30". */
export function timeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Sat, Nov 14" from "2026-11-14". */
export function dateLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${WEEKDAYS[weekdayOf(date)]}, ${MONTHS[m - 1]} ${d}`;
}

/** "November 2026" from "2026-11". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
