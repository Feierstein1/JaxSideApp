import { describe, expect, it } from 'vitest';
import { EMAIL_LOGO } from '@/server/mail/logo';
import {
  accountDeletedEmail,
  businessInviteEmail,
  emailChangeCodeEmail,
  emailChangeNoticeEmail,
  emailChangeTakenEmail,
  ownerCodeEmail,
  passwordResetEmail,
  registrationAttemptEmail,
  verificationEmail,
} from '@/server/mail/templates';

// P15.3: every email has a branded HTML version alongside the plain text.
const BASE = 'https://jaxside.test';
const ALL = [
  verificationEmail('a@example.test', BASE, 'tok/en+1', '482913'),
  registrationAttemptEmail('a@example.test', BASE),
  passwordResetEmail('a@example.test', BASE, 'tok/en+1', '482913'),
  emailChangeCodeEmail('a@example.test', '482913'),
  emailChangeNoticeEmail('a@example.test', 'requested'),
  emailChangeNoticeEmail('a@example.test', 'completed'),
  emailChangeTakenEmail('a@example.test'),
  accountDeletedEmail('a@example.test', 30),
  ownerCodeEmail('a@example.test', '482913', 'Bold Bean'),
  businessInviteEmail('a@example.test', 'Bold Bean', 'http://localhost:3100/invite?token=abc', 7),
];

describe('branded emails', () => {
  it('every email has a plain-text and an HTML version with the inline logo', () => {
    for (const mail of ALL) {
      expect(mail.text.length).toBeGreaterThan(0);
      expect(mail.html).toContain(`src="cid:${EMAIL_LOGO.cid}"`);
      expect(mail.html).toContain('alt="JaxSide"');
    }
  });

  it('shows the code large and spaced, the same code as the text version', () => {
    const mail = verificationEmail('a@example.test', BASE, 'tok', '482913');
    expect(mail.text).toContain('482 913');
    expect(mail.html).toContain('482 913');
  });

  it('the button carries the same link as the text version, with the token encoded', () => {
    const mail = passwordResetEmail('a@example.test', BASE, 'tok/en+1', '482913');
    const link = `${BASE}/reset-password?token=${encodeURIComponent('tok/en+1')}`;
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(`href="${link}"`);
  });

  it('escapes outside text, so a business name cannot add markup to the email', () => {
    const mail = ownerCodeEmail('a@example.test', '482913', '<b onmouseover="x">Cafe</b> & "Co"');
    expect(mail.html).not.toContain('<b onmouseover');
    expect(mail.html).toContain(
      '&lt;b onmouseover=&quot;x&quot;&gt;Cafe&lt;/b&gt; &amp; &quot;Co&quot;',
    );
    // D172: the business invite carries the place name too.
    const invite = businessInviteEmail(
      'a@example.test',
      '<b onmouseover="x">Cafe</b>',
      'http://x/i',
      7,
    );
    expect(invite.html).not.toContain('<b onmouseover');
  });

  it('the logo is a real PNG of the stated size', () => {
    expect(EMAIL_LOGO.png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(EMAIL_LOGO.png.readUInt32BE(16)).toBe(EMAIL_LOGO.width * 2);
    expect(EMAIL_LOGO.png.readUInt32BE(20)).toBe(EMAIL_LOGO.height * 2);
  });
});
