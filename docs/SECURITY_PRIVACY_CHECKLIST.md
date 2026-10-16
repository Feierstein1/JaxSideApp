# Security and privacy checklist

Each control, where it lives, and how it's verified. ✅ = implemented and covered by an automated
test; 📋 = a launch task for you or the hosting setup.

## Identity and sessions

| Control                                                                                   | Where / decision       | Verified by                                      |
| ----------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------ |
| ✅ Passwords hashed with argon2id; length rules; edge spaces trimmed                      | `auth/crypto.ts`, D32  | `auth.test.ts`                                   |
| ✅ Opaque session tokens, stored only as SHA-256 hashes; revocable                        | `auth/sessions.ts`, D3 | `auth.test.ts`, `bypass.test.ts`                 |
| ✅ Failed-login limits per account and per IP (failures only)                             | D29                    | `auth.test.ts`                                   |
| ✅ No account enumeration (register, reset, email change)                                 | D31, D47               | `auth.test.ts`, `account.test.ts`                |
| ✅ Email verification and password reset by single-use 6-digit codes                      | D31                    | `email-codes.test.ts`                            |
| ✅ Password/email changes need the current password; other devices signed out             | P4.10                  | `account.test.ts`                                |
| ✅ Admin: role check, TOTP 2FA, httpOnly SameSite=Strict cookie + CSRF, 8 h / 30 min idle | D60                    | `admin-auth.test.ts` (incl. RFC vectors, replay) |
| ✅ App and admin sessions never cross over                                                | D60                    | `admin-auth.test.ts`                             |
| ✅ Admin portal off on public servers unless enabled                                      | D62                    | `admin-auth.test.ts`                             |

## Authorization and input

| Control                                                                                    | Where / decision   | Verified by                                          |
| ------------------------------------------------------------------------------------------ | ------------------ | ---------------------------------------------------- |
| ✅ Every write route: guard → strict schema → rate limit → location → ownership            | CLAUDE.md, P3.7    | `write-routes.test.ts` (fails if a route is missing) |
| ✅ Client can't set role, score, status, author, location or totals                        | strict zod schemas | `bypass.test.ts`, `write-routes.test.ts`             |
| ✅ Other people's content → 404 (no ID probing)                                            | services           | `bypass.test.ts`, `discussions.test.ts`              |
| ✅ Guests are view-only                                                                    | D54                | `guests.test.ts`                                     |
| ✅ Banned/suspended/deleted accounts refused everywhere; bans carry to the phone           | D58, P4.6          | `enforcement.test.ts`                                |
| ✅ Rate limits on every write, including burst windows that can't be slipped at a boundary | D8, D55, D66       | `rate-limits.test.ts`                                |
| ✅ Plain-text rendering only (no HTML/markdown from users)                                 | P3.10              | app code review                                      |

## Location (risk R1: GPS can be faked, so checks are layered)

| Control                                                                     | Verified by                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------- |
| ✅ Inside Duval (PostGIS), within the action's radius                       | `location-eligibility.test.ts`                     |
| ✅ Stale, future-dated, inaccurate and mock-location readings refused       | `bypass.test.ts`                                   |
| ✅ Impossible travel refused and flagged; suspicious speed flagged          | `travel-and-maintenance.test.ts`, `bypass.test.ts` |
| ✅ Every check audited; an allowed check that can't be audited fails closed | `location-eligibility.test.ts`                     |
| 📋 App-integrity signals (Play Integrity, App Attest): interface only       | `EXTERNAL_SERVICES.md`                             |

## Personal data

| Control                                                                                                           | Where / decision         | Verified by                                     |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------- |
| ✅ Emails encrypted per user (AES-256-GCM, wrapped keys); lookups by keyed hash                                   | D35                      | `pii-encryption.test.ts`                        |
| ✅ Birth year never stored                                                                                        | D36                      | `auth.test.ts`                                  |
| ✅ Public responses: allow-list serializers + forbidden-key scan                                                  | P1.19                    | `serializers.test.ts`, feature tests            |
| ✅ Posts store a ~100 m point; exact readings deleted after 30 days                                               | D7, D14                  | `discussions.test.ts`, maintenance tests        |
| ✅ Account deletion: immediate; crypto-shred after 30 days unless on legal hold                                   | D37, D48                 | `account.test.ts`                               |
| ✅ Photos: real-type check, re-encoded, all metadata (GPS) removed, random keys, private bucket, signed 1 h links | D65                      | `photos.test.ts` (mutation-checked), live check |
| ✅ Admin pages never show emails                                                                                  | D61                      | `moderation-queue.test.ts`                      |
| 📋 Master keys in a secrets store + offline backup                                                                | R10, `KEY_MANAGEMENT.md` | launch task                                     |

## Content safety

| Control                                                             | Verified by                                   |
| ------------------------------------------------------------------- | --------------------------------------------- |
| ✅ Reports (posts, comments, photos, profiles), dedupe, limits      | `reports.test.ts`                             |
| ✅ Blocking both ways                                               | `account.test.ts`                             |
| ✅ Text screening with normalization; hold for review               | `screening.test.ts`                           |
| ✅ Duplicate and link spam checks                                   | `spam.test.ts`                                |
| ✅ Moderation queue, strikes, appeals, audit log                    | `moderation-queue.test.ts`, `appeals.test.ts` |
| ✅ Child-safety escalation preserves evidence and sets a legal hold | `moderation-queue.test.ts`                    |
| 📋 NCMEC CyberTipline registration; slur list (Q14)                 | launch tasks                                  |

## Platform and operations

| Control                                                                                                            | Status                    |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| ✅ Security headers (no-referrer, nosniff, frame deny, permissions policy)                                         | `next.config.ts`          |
| ✅ Errors never leak internals (generic 500 + request ID in logs); logs redact tokens                              | `http.ts`, `logger.ts`    |
| ✅ No secrets in git (history scanned 2026-10-16)                                                                  | P7.3                      |
| ✅ Server production dependencies: 0 known vulnerabilities (2026-10-16)                                            | P7.3; mobile tooling: R11 |
| ✅ Backup/restore drilled                                                                                          | `OPERATIONS.md`           |
| 📋 HTTPS only (Caddy/Let's Encrypt), database not publicly reachable, least-privilege IAM, SES with SPF/DKIM/DMARC | `LAUNCH_SERVICES.md`      |
