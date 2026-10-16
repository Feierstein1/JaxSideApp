/**
 * Generates docs/API.md from the route files, so the reference can't drift from the code.
 *
 *   npm run docs:api -w @jax/server
 *
 * For each route it lists the method, path, who may call it, whether it needs a location
 * reading, and the doc comment written above the handler.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../src/app/api/v1');
const HANDLERS = readFileSync(
  path.resolve(import.meta.dirname, '../../src/server/discussions/handlers.ts'),
  'utf8',
);
const OUT = path.resolve(import.meta.dirname, '../../../../docs/API.md');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === 'route.ts') out.push(p);
  }
  return out;
}

/** The /** … *\/ block right before `index` (blank lines allowed), as one line. */
function docBefore(src: string, index: number): string | null {
  const before = src.slice(0, index).trimEnd();
  if (!before.endsWith('*/')) return null;
  const start = before.lastIndexOf('/**');
  if (start < 0) return null;
  return before
    .slice(start + 3, -2)
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ');
}

/** Source of a handler in handlers.ts that a route delegates to (by function name). */
function handlerSource(name: string): { src: string; doc: string | null } | null {
  const m = new RegExp(`export (?:async )?function ${name}\\b`).exec(HANDLERS);
  if (!m) return null;
  const next = HANDLERS.indexOf('\nexport ', m.index + 10);
  return {
    src: HANDLERS.slice(m.index, next < 0 ? undefined : next),
    doc: docBefore(HANDLERS, m.index),
  };
}

function access(src: string, kind?: string): string {
  if (/requireAdmin\(/.test(src)) return 'admin (cookie + CSRF)';
  if (/restrictedUser\(/.test(src)) return 'username + password (banned/suspended)';
  if (/checkSignature\(/.test(src)) return 'signed link (from a post or profile)';
  if (/kind === 'general'\s*\?\s*await requireActor/.test(src)) {
    return kind === 'business' ? 'user' : 'user or guest';
  }
  if (/requireActor\(/.test(src)) return 'user or guest';
  if (/requireUser\(req, (VERIFIED|\{ requireVerifiedEmail: true \})/.test(src))
    return 'user (confirmed email)';
  if (/requireUser\(/.test(src)) return 'user';
  return 'public';
}

const needsLocation = (src: string) =>
  /assertLocationEligible|checkPostAccess|reading/.test(src) ? 'yes' : '';

const rows: {
  group: string;
  method: string;
  path: string;
  who: string;
  loc: string;
  doc: string;
}[] = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, path.dirname(file)).split(path.sep).join('/');
  const urlPath = `/api/v1/${rel}`.replace(/\[(\w+)\]/g, ':$1');
  const src = readFileSync(file, 'utf8');
  for (const method of METHODS) {
    const m = new RegExp(
      // The type argument may nest (`route<{ params: Promise<{ id: string }> }>(`).
      `export const ${method}\\b[^=]*=\\s*route(?:<.*?>)?\\(([\\s\\S]*?)\\);?\\n`,
    ).exec(src);
    if (!m) continue;
    // Delegating route: `route(createGeneral)` or `route<IdCtx>(postDetail('business'))`.
    const call = /^\s*(\w+)(?:\('(\w+)'\))?\s*$/.exec(m[1]!);
    const h = call ? handlerSource(call[1]!) : null;
    const body = h ? h.src : src;
    rows.push({
      group: rel.split('/')[0]!,
      method,
      path: urlPath,
      who: access(body, call?.[2]),
      loc: needsLocation(h ? h.src : src),
      doc: docBefore(src, m.index) ?? h?.doc ?? docBefore(src, src.indexOf('export const')) ?? '',
    });
  }
}

const order = (g: string) =>
  [
    'health',
    'installations',
    'auth',
    'session',
    'guests',
    'me',
    'users',
    'location',
    'feed',
    'posts',
    'comments',
    'business-posts',
    'places',
    'submissions',
    'photos',
    'reports',
    'appeals',
    'admin',
  ].indexOf(g);
rows.sort(
  (a, b) =>
    order(a.group) - order(b.group) ||
    a.path.localeCompare(b.path) ||
    METHODS.indexOf(a.method as never) - METHODS.indexOf(b.method as never),
);

const esc = (s: string) => s.replace(/\|/g, '\\|');
let md = `# API reference

Generated from the route files by \`npm run docs:api -w @jax/server\`; don't edit by hand.
${rows.length} endpoints.

- **Who:** \`public\` (no session), \`user\` (app session: \`Authorization: Bearer <token>\`),
  \`user (confirmed email)\`, \`user or guest\` (guests are view-only, D54), \`admin\` (portal cookie;
  changes also need the \`X-CSRF-Token\` header; off in production unless enabled, D62).
- **Location:** the body carries a fresh \`reading\` (\`latitude\`, \`longitude\`, \`accuracyMeters\`,
  \`timestamp\`, optional \`mocked\`); the server checks Duval and any radius (§6).
- Every request body is a strict JSON schema in \`@jax/shared\` (unknown fields → 400). Errors look
  like \`{ "error": { "code", "message", "details"? } }\`; rate limits answer 429 with \`Retry-After\`.
- The app also sends \`X-Installation-Token\` (from \`POST /installations\`) for ban carry-over.

`;
let group = '';
for (const r of rows) {
  if (r.group !== group) {
    group = r.group;
    md += `\n## ${group}\n\n| Method | Path | Who | Location | What it does |\n| --- | --- | --- | --- | --- |\n`;
  }
  md += `| ${r.method} | \`${r.path}\` | ${r.who} | ${r.loc} | ${esc(r.doc)} |\n`;
}
writeFileSync(OUT, md);
console.log(`Wrote ${rows.length} endpoints to docs/API.md`);
