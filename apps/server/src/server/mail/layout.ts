import { COLORS } from '@jax/shared';
import { EMAIL_LOGO } from './logo';

/*
 * P15.3: the branded HTML version of every email. Each email still has its plain-text
 * version (what tests read and what text-only mail apps show); this is the same content in
 * the JaxSide look: a black band with the logo, a white card, the code in a large box and
 * the link as a button. Email apps only handle simple HTML reliably, so this uses tables and
 * inline styles, no web fonts, and the logo is attached to the email (cid) instead of loaded
 * from the web.
 */

export interface EmailBody {
  /** One line some mail apps show next to the subject in the inbox. */
  preheader: string;
  heading: string;
  /** Paragraphs before the code or button. */
  intro: string[];
  /** A 6-digit code, shown large and spaced. */
  code?: string;
  /** A line under the code, e.g. when it expires. */
  codeNote?: string;
  button?: { label: string; url: string; note?: string };
  /** Smaller paragraphs at the end (e.g. "If this wasn't you…"). */
  footnotes?: string[];
}

/** Every value from outside (place names, links) goes through this. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SF Mono', Menlo, Consolas, 'Courier New', monospace";

function paragraph(text: string, size = 16, color: string = COLORS.text): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:${size}px;line-height:1.5;color:${color};">${escapeHtml(text)}</p>`;
}

export function renderEmail(body: EmailBody): string {
  const code = body.code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 ${body.codeNote ? 8 : 20}px;">
<tr><td style="background:${COLORS.surfaceMuted};border:1px solid ${COLORS.cardBorder};border-radius:12px;padding:16px 24px;font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:6px;color:${COLORS.text};">${escapeHtml(`${body.code.slice(0, 3)} ${body.code.slice(3)}`)}</td></tr>
</table>${body.codeNote ? paragraph(body.codeNote, 14, COLORS.textMuted) : ''}`
    : '';
  const button = body.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 ${body.button.note ? 8 : 20}px;">
<tr><td style="background:${COLORS.primary};border-radius:999px;">
<a href="${escapeHtml(body.button.url)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:16px;font-weight:700;color:${COLORS.onPrimary};text-decoration:none;">${escapeHtml(body.button.label)}</a>
</td></tr>
</table>${body.button.note ? paragraph(body.button.note, 14, COLORS.textMuted) : ''}`
    : '';
  const footnotes = (body.footnotes ?? []).map((t) => paragraph(t, 14, COLORS.textMuted)).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(body.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.surfaceMuted};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.surfaceMuted};">${escapeHtml(body.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.surfaceMuted};">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="background:${COLORS.surfaceInverse};border-radius:16px 16px 0 0;padding:20px 28px;">
<img src="cid:${EMAIL_LOGO.cid}" width="${EMAIL_LOGO.width}" height="${EMAIL_LOGO.height}" alt="JaxSide" style="display:block;border:0;color:${COLORS.onSurfaceInverse};font-family:${FONT};font-size:24px;font-weight:800;">
</td></tr>
<tr><td style="background:${COLORS.background};border:1px solid ${COLORS.cardBorder};border-top:0;border-radius:0 0 16px 16px;padding:28px 28px 12px;">
<h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;color:${COLORS.text};">${escapeHtml(body.heading)}</h1>
${body.intro.map((t) => paragraph(t)).join('')}
${code}${button}${footnotes}
</td></tr>
<tr><td style="padding:18px 28px;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.textMuted};text-align:center;">
JaxSide · Jacksonville, Florida<br>You're getting this email because of an action on a JaxSide account.
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}
