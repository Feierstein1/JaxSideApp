# API reference

Base path: `/api/v1`. JSON in and out. Mobile clients authenticate with `Authorization: Bearer <token>`.

**Rules for every endpoint**

- Request bodies are strict: an unknown field gets a `400 VALIDATION_ERROR`. You can't send `role`, `status` or IDs to change them.
- Errors look like `{ "error": { "code", "message", "details?" } }`. Unexpected failures return
  `500 INTERNAL` with a reference ID and no internal detail.
- `429 RATE_LIMITED` includes `details.retryAfterSeconds`. Limits live in `AppConfiguration`.
- Banned or suspended accounts get `403 ACCOUNT_BANNED` or `ACCOUNT_SUSPENDED` (with `details.until`) on every
  authenticated call.

## Health

| Method | Path      | Auth | Response                                                        |
| ------ | --------- | ---- | --------------------------------------------------------------- |
| GET    | `/health` | none | `200 {status:"ok", database:"ok"}` or `503 {status:"degraded"}` |

## Auth

| Method | Path                           | Auth   | Body                                                                        | Response                                  |
| ------ | ------------------------------ | ------ | --------------------------------------------------------------------------- | ----------------------------------------- |
| POST   | `/auth/register`               | none   | `username, email, password, birthYear, acceptTerms:true, confirmAdult:true` | `202 {status:"verification_sent"}`        |
| POST   | `/auth/login`                  | none   | `identifier` (username or email), `password`                                | `200 {token, expiresAt, user}`            |
| POST   | `/auth/logout`                 | bearer | none                                                                        | `200 {status:"signed_out"}` (this device) |
| DELETE | `/auth/sessions`               | bearer | none                                                                        | `200 {revoked}` (every device)            |
| POST   | `/auth/verify-email`           | none   | `token`                                                                     | `200 {status:"verified"}`                 |
| POST   | `/auth/verify-email/resend`    | bearer | `{}`                                                                        | `200 {status}`                            |
| POST   | `/auth/password-reset/request` | none   | `email`                                                                     | `202 {status:"reset_requested"}`          |
| POST   | `/auth/password-reset/confirm` | none   | `token, newPassword`                                                        | `200`; all sessions revoked               |

**Privacy behavior**

- Registering with an email that already has an account returns the same `202` as a new signup. The
  owner gets a "someone tried to sign up" email instead of a second account.
- Password-reset requests always return the same `202`. Email goes out only if the account exists,
  with at most 3 per account per hour.
- A wrong password and an unknown account return the same `401 INVALID_CREDENTIALS`. Deleted accounts
  look like unknown accounts.

**Error codes:** `USERNAME_TAKEN` (409), `AGE_INELIGIBLE` (422, `details.maxBirthYear`),
`INVALID_TOKEN` (400, for expired, used or wrong-purpose links), `EMAIL_NOT_VERIFIED` (403, on write
endpoints, D11).

**Throttles (defaults):** register 5/hour per IP. Login: 15 _failed_ attempts per 15 min per IP and 10 _failed_
attempts per 15 min per account (successful logins never count, D29). Reset 5/hour per IP. Verification resend 3/hour per user.

## Account

| Method | Path  | Auth   | Response                                                                                                   |
| ------ | ----- | ------ | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/me` | bearer | `200 {user: {id, username, bio, joinedAt, email, emailVerified, generalRadiusMiles, businessRadiusMiles}}` |

`/me` is the only place a user's email is returned, and only to that user. Birth year, password
hash, role and status internals are never returned.

## Web pages (email links)

- `/verify-email?token=…`: the user presses a button to confirm. A GET never consumes the token,
  because email scanners prefetch links.
- `/reset-password?token=…`: form to set a new password. Without a token, it shows a form to request a link.
- All pages send `Referrer-Policy: no-referrer`, and these paths are left out of the dev request log.
