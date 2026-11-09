import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * D192: anything you can type into must stay above the keyboard (on Android the keyboard
 * otherwise hides what you type until it closes). A screen or sheet that has a text box must use
 * `Screen` (keyboard-safe unless it opts out), `KeyboardSafeView` or `Sheet` (which rises above
 * the keyboard). This reads the source and fails for a new file that does none of them.
 */
const root = path.resolve(import.meta.dirname, '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

/**
 * Pieces that are only ever shown inside a screen that already handles the keyboard, and screens
 * whose only text box is a search field at the top of a list (the keyboard can't cover it).
 */
const OK_WITHOUT: Record<string, string> = {
  'src/auth/EmailCodeCard.tsx': 'shown inside the verify gate and the account screen',
  'src/standing/StrikeList.tsx': 'shown inside Screen keyboard (standing, appeal)',
  'app/(app)/(home)/index.tsx': 'search field at the top of the feed',
  'app/(app)/citywide/all.tsx': 'search field at the top of the list',
  'app/(app)/citywide/polls.tsx': 'search field at the top of the list',
  'app/(app)/friends/index.tsx': 'search field at the top of the list',
  'app/(app)/places/index.tsx': 'search field at the top of the list',
};

const handlesKeyboard = (src: string) =>
  /KeyboardSafeView/.test(src) ||
  /<Sheet\b/.test(src) ||
  (/<Screen\b/.test(src) && !/<Screen\b[^>]*keyboard=\{false\}/.test(src));

describe('text boxes stay above the keyboard (D192)', () => {
  const files = [...tsxFiles(path.join(root, 'app')), ...tsxFiles(path.join(root, 'src'))]
    .map((f) => path.relative(root, f).replaceAll('\\', '/'))
    .filter((f) => !['src/ui.tsx', 'src/text.tsx'].includes(f));

  it.each(
    files.filter((f) => /<(TextInput|Field)\b/.test(readFileSync(path.join(root, f), 'utf8'))),
  )('%s', (f) => {
    const src = readFileSync(path.join(root, f), 'utf8');
    if (OK_WITHOUT[f]) return;
    expect(
      handlesKeyboard(src),
      `${f} has a text box but no KeyboardSafeView, Screen or Sheet`,
    ).toBe(true);
  });

  it('the allowed exceptions still exist (remove stale entries)', () => {
    for (const f of Object.keys(OK_WITHOUT)) expect(files).toContain(f);
  });
});
