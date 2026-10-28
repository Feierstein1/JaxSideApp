import { describe, expect, it } from 'vitest';
import { mentionedUsernames } from './social';

// D156: who a post or comment mentions.
describe('mentionedUsernames', () => {
  it('finds each @username once, in order, in lower case', () => {
    expect(mentionedUsernames('Thanks @Bob_N and @cat_n, and @bob_n again!')).toEqual([
      'bob_n',
      'cat_n',
    ]);
  });

  it('ignores email addresses, @@, and names too short or too long', () => {
    expect(mentionedUsernames('mail me at ann@example.com')).toEqual([]);
    expect(mentionedUsernames('@@bob_n')).toEqual([]);
    expect(mentionedUsernames('@ab hi')).toEqual([]);
    expect(mentionedUsernames('@abcdefghijklmnopqrstu')).toEqual([]); // 21 characters
    expect(mentionedUsernames('(@dan_n)')).toEqual(['dan_n']);
  });
});
