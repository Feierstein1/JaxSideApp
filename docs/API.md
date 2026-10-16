# API reference

Generated from the route files by `npm run docs:api -w @jax/server`; don't edit by hand.
80 endpoints.

- **Who:** `public` (no session), `user` (app session: `Authorization: Bearer <token>`),
  `user (confirmed email)`, `user or guest` (guests are view-only, D54), `admin` (portal cookie;
  changes also need the `X-CSRF-Token` header; off in production unless enabled, D62).
- **Location:** the body carries a fresh `reading` (`latitude`, `longitude`, `accuracyMeters`,
  `timestamp`, optional `mocked`); the server checks Duval and any radius (§6).
- Every request body is a strict JSON schema in `@jax/shared` (unknown fields → 400). Errors look
  like `{ "error": { "code", "message", "details"? } }`; rate limits answer 429 with `Retry-After`.
- The app also sends `X-Installation-Token` (from `POST /installations`) for ban carry-over.

## health

| Method | Path             | Who    | Location | What it does |
| ------ | ---------------- | ------ | -------- | ------------ |
| GET    | `/api/v1/health` | public |          |              |

## installations

| Method | Path                    | Who    | Location | What it does                                                                           |
| ------ | ----------------------- | ------ | -------- | -------------------------------------------------------------------------------------- |
| POST   | `/api/v1/installations` | public |          | P2.7: the app calls this once, on first launch, and keeps the token in secure storage. |

## auth

| Method | Path                                       | Who    | Location | What it does                                                                                      |
| ------ | ------------------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/login`                       | public |          |                                                                                                   |
| POST   | `/api/v1/auth/logout`                      | user   |          | Signs out this device only.                                                                       |
| POST   | `/api/v1/auth/password-reset/confirm`      | public |          |                                                                                                   |
| POST   | `/api/v1/auth/password-reset/confirm-code` | public |          | D31: reset the password in the app with email + 6-digit code + new password.                      |
| POST   | `/api/v1/auth/password-reset/request`      | public |          | Always 202 with the same body, whether or not the email has an account.                           |
| POST   | `/api/v1/auth/register`                    | public |          |                                                                                                   |
| DELETE | `/api/v1/auth/sessions`                    | user   |          | Signs out everywhere: revokes every session for the caller, including this one.                   |
| POST   | `/api/v1/auth/verify-email`                | public |          | No session needed: the single-use emailed token is the credential.                                |
| POST   | `/api/v1/auth/verify-email/code`           | user   |          | D31: confirm email in the app with the 6-digit code. Session required (no verified email needed). |
| POST   | `/api/v1/auth/verify-email/resend`         | user   |          |                                                                                                   |

## session

| Method | Path              | Who           | Location | What it does                                                                       |
| ------ | ----------------- | ------------- | -------- | ---------------------------------------------------------------------------------- |
| GET    | `/api/v1/session` | user or guest |          | Who the app is signed in as: a registered user, or a guest with its expiry (P4.4). |

## guests

| Method | Path             | Who    | Location | What it does                                                                                                                                               |
| ------ | ---------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/guests` | public |          | P4.1: start (or resume) guest mode on this app installation. The guest token is used like a session token; the internal guest ID is never returned (P4.3). |

## me

| Method | Path                       | Who                    | Location | What it does                                                                                                                                          |
| ------ | -------------------------- | ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/me`               | user                   |          | The caller's own account. Private view (includes their email), still via a serializer.                                                                |
| POST   | `/api/v1/me/appeals`       | user                   |          | P5.7: appeal a warning (or other strike) while signed in.                                                                                             |
| PUT    | `/api/v1/me/avatar`        | user (confirmed email) |          | P6.5: set your profile photo to one you uploaded (same pipeline as post photos).                                                                      |
| DELETE | `/api/v1/me/avatar`        | user (confirmed email) |          | Remove your profile photo.                                                                                                                            |
| GET    | `/api/v1/me/blocks`        | user                   |          | P4.11: the people you've blocked (settings).                                                                                                          |
| POST   | `/api/v1/me/delete`        | user                   |          | P4.12: delete your account (password, plus typing DELETE).                                                                                            |
| POST   | `/api/v1/me/email`         | user                   |          | P4.10: start an email change (a code is sent to the new address).                                                                                     |
| POST   | `/api/v1/me/email/confirm` | user                   |          | P4.10: finish an email change with the code.                                                                                                          |
| GET    | `/api/v1/me/favorites`     | user                   |          | P2.14: the caller's saved places. Part of account settings, so no location needed (D16).                                                              |
| GET    | `/api/v1/me/medals`        | user                   |          | P6.9: your own medals (Account → Profile).                                                                                                            |
| POST   | `/api/v1/me/password`      | user                   |          | P4.10: change password; other devices are signed out. Wrong guesses are rate-limited.                                                                 |
| PATCH  | `/api/v1/me/preferences`   | user                   |          | P2.15: radius preferences. Users may narrow their radius but never widen it past the server maximum (§7): values are clamped to the configured range. |
| PATCH  | `/api/v1/me/profile`       | user                   |          | P4.8 (early): edit your own public bio. Plain text (P3.10); empty clears it.                                                                          |
| GET    | `/api/v1/me/reports`       | user                   |          | P4.11 / P5.1: the reports you've sent and their status.                                                                                               |
| GET    | `/api/v1/me/standing`      | user                   |          | P5.6: your warnings and suspensions that still count, the reason given, and appeals (P5.7).                                                           |
| GET    | `/api/v1/me/submissions`   | user                   |          | P5.8: your suggested places and how they went.                                                                                                        |
| PATCH  | `/api/v1/me/username`      | user                   |          | P4.9: change your username. Cooldown applies; your account ID and history stay the same.                                                              |

## users

| Method | Path                            | Who           | Location | What it does                                                                                                                                |
| ------ | ------------------------------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/users/:username`       | user or guest | yes      | P4.8: a public profile and the person's recent area posts. Like the feed, it needs an in-Duval reading (D16); guests may view profiles too. |
| PUT    | `/api/v1/users/:username/block` | user          |          |                                                                                                                                             |
| DELETE | `/api/v1/users/:username/block` | user          |          |                                                                                                                                             |

## location

| Method | Path                      | Who  | Location | What it does                                                                                                                                                                                                                              |
| ------ | ------------------------- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/location/status` | user | yes      | P2.9: "Can I use location features where I am?" Runs the full server location check for reading content (D16) and returns 200, or 403 with the specific reason. POST so the coordinates travel in the body, never in a URL or access log. |

## feed

| Method | Path           | Who           | Location | What it does                                                  |
| ------ | -------------- | ------------- | -------- | ------------------------------------------------------------- |
| POST   | `/api/v1/feed` | user or guest | yes      | P3.1: the general feed around the reader's verified location. |

## posts

| Method | Path                         | Who                    | Location | What it does                                                                             |
| ------ | ---------------------------- | ---------------------- | -------- | ---------------------------------------------------------------------------------------- |
| POST   | `/api/v1/posts`              | user (confirmed email) | yes      | P3.1: create a general post.                                                             |
| POST   | `/api/v1/posts/:id`          | user or guest          | yes      | P3.1 / P3.8: read a general post with comments (POST: carries a location), edit, delete. |
| PATCH  | `/api/v1/posts/:id`          | user (confirmed email) |          | PATCH: author edits their own post (P3.8). No location check: content already placed.    |
| DELETE | `/api/v1/posts/:id`          | user                   |          | DELETE: author soft-deletes their own post (P3.8).                                       |
| POST   | `/api/v1/posts/:id/comments` | user (confirmed email) | yes      | POST /…/:id/comments: comment or reply (P3.3, D20 / D19). Registered users only (D54).   |
| PUT    | `/api/v1/posts/:id/vote`     | user (confirmed email) | yes      | PUT /…/:id/vote: up, down or clear (P3.4, D6).                                           |

## comments

| Method | Path                        | Who                    | Location | What it does                                                                |
| ------ | --------------------------- | ---------------------- | -------- | --------------------------------------------------------------------------- |
| PATCH  | `/api/v1/comments/:id`      | user (confirmed email) |          | P3.8: authors edit or delete their own comments.                            |
| DELETE | `/api/v1/comments/:id`      | user                   |          | P3.8: authors edit or delete their own comments.                            |
| PUT    | `/api/v1/comments/:id/vote` | user (confirmed email) | yes      | PUT /comments/:id/vote: same location rule as voting on the comment's post. |

## business-posts

| Method | Path                                  | Who                    | Location | What it does                                                                           |
| ------ | ------------------------------------- | ---------------------- | -------- | -------------------------------------------------------------------------------------- |
| POST   | `/api/v1/business-posts/:id`          | user                   | yes      | P3.2 / P3.8: a business-room post (readable within 0.3 mi of its place, D19).          |
| PATCH  | `/api/v1/business-posts/:id`          | user (confirmed email) |          | PATCH: author edits their own post (P3.8). No location check: content already placed.  |
| DELETE | `/api/v1/business-posts/:id`          | user                   |          | DELETE: author soft-deletes their own post (P3.8).                                     |
| POST   | `/api/v1/business-posts/:id/comments` | user (confirmed email) | yes      | POST /…/:id/comments: comment or reply (P3.3, D20 / D19). Registered users only (D54). |
| PUT    | `/api/v1/business-posts/:id/vote`     | user (confirmed email) | yes      | PUT /…/:id/vote: up, down or clear (P3.4, D6).                                         |

## places

| Method | Path                            | Who                    | Location | What it does                                                                        |
| ------ | ------------------------------- | ---------------------- | -------- | ----------------------------------------------------------------------------------- |
| POST   | `/api/v1/places/:id`            | user                   | yes      | P2.13: one place's info and distance. Body carries the reading, so it's a POST.     |
| PUT    | `/api/v1/places/:id/favorite`   | user                   |          |                                                                                     |
| DELETE | `/api/v1/places/:id/favorite`   | user                   |          |                                                                                     |
| POST   | `/api/v1/places/:id/posts`      | user (confirmed email) | yes      | P3.2: post in a place's room (within 0.3 mi, D19).                                  |
| POST   | `/api/v1/places/:id/posts/list` | user                   | yes      | P3.2: a place's room, newest first (within 0.3 mi, D19).                            |
| POST   | `/api/v1/places/search`         | user                   | yes      | P2.13: search the directory. Needs a fresh in-Duval reading (D16); no radius (D19). |

## submissions

| Method | Path                        | Who                    | Location | What it does                                                                                                                                              |
| ------ | --------------------------- | ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/submissions`       | user (confirmed email) | yes      | P5.8: suggest a missing place (D63). The pin is the reading, which must be inside Duval. Limits (daily, pending, account age) are checked in the service. |
| POST   | `/api/v1/submissions/check` | user                   | yes      | P5.9: before suggesting a place, show listed places that might be the same one.                                                                           |

## photos

| Method | Path                 | Who                                  | Location | What it does                                                                                                                                                                                                                                             |
| ------ | -------------------- | ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/photos`     | user (confirmed email)               |          | P6.1/P6.2: upload one photo (the raw image bytes as the body). Registered users with a confirmed email only; rate-limited; the server checks and re-encodes it before anything is stored (D65). Returns an ID to attach to a post or set as your avatar. |
| GET    | `/api/v1/photos/:id` | signed link (from a post or profile) |          | P6.4: serves a photo through a short-lived signed link (posts and profiles carry the links; the storage bucket itself is private). Expired or forged links get 403; removed, unattached-and-stale, or unknown photos 404.                                |

## reports

| Method | Path              | Who  | Location | What it does                                                                                                                                   |
| ------ | ----------------- | ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/reports` | user | yes      | P5.1: report a post, comment or profile. Registered users only (guests are view-only, D54). Needs an in-Duval reading like viewing does (D16). |

## appeals

| Method | Path                                  | Who                                    | Location | What it does                                                                     |
| ------ | ------------------------------------- | -------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| POST   | `/api/v1/appeals/restricted`          | username + password (banned/suspended) |          | P5.7: a banned or suspended person appeals (password instead of a session, D59). |
| POST   | `/api/v1/appeals/restricted/standing` | username + password (banned/suspended) |          | P5.7: a banned or suspended person sees why, and what they can appeal.           |

## admin

| Method | Path                              | Who                   | Location | What it does                                                                            |
| ------ | --------------------------------- | --------------------- | -------- | --------------------------------------------------------------------------------------- |
| GET    | `/api/v1/admin/appeals`           | admin (cookie + CSRF) |          | P5.7 / P5.14: appeals waiting (or decided).                                             |
| POST   | `/api/v1/admin/appeals/:id`       | admin (cookie + CSRF) |          | P5.7: accept (cancels the strike) or reject an appeal, with a note the person sees.     |
| GET    | `/api/v1/admin/audit`             | admin (cookie + CSRF) |          | P5.16: the admin audit log, newest first.                                               |
| GET    | `/api/v1/admin/cases`             | admin (cookie + CSRF) |          | P5.14: the moderation queue (open reports grouped by item, most urgent first).          |
| GET    | `/api/v1/admin/cases/:type/:id`   | admin (cookie + CSRF) |          | P5.14: one case with its reports, context and the author's history.                     |
| POST   | `/api/v1/admin/cases/:type/:id`   | admin (cookie + CSRF) |          | P5.14: decide the case (remove, approve, dismiss, escalate), optionally with a strike.  |
| POST   | `/api/v1/admin/login`             | public                |          | P5.11 step 1: password. Returns a short-lived challenge (and 2FA setup the first time). |
| POST   | `/api/v1/admin/login/verify`      | public                |          | P5.11 step 2: authenticator code. Starts the admin session (cookies).                   |
| POST   | `/api/v1/admin/logout`            | admin (cookie + CSRF) |          | P5.11: end the admin session.                                                           |
| GET    | `/api/v1/admin/photos/:id`        | admin (cookie + CSRF) |          | P6.5: moderators can see a reported photo, including after it's removed.                |
| GET    | `/api/v1/admin/submissions`       | admin (cookie + CSRF) |          | P5.12: the submission queue with filters, duplicate candidates and submitter history.   |
| POST   | `/api/v1/admin/submissions/:id`   | admin (cookie + CSRF) |          | P5.12 / P5.13: approve (optionally corrected), reject with a reason, or merge.          |
| POST   | `/api/v1/admin/submissions/bulk`  | admin (cookie + CSRF) |          | P5.12: approve or reject a selected batch (the page lists them for confirmation first). |
| GET    | `/api/v1/admin/summary`           | admin (cookie + CSRF) |          | P5.11: counts for the admin dashboard.                                                  |
| GET    | `/api/v1/admin/users`             | admin (cookie + CSRF) |          | P5.14: find a person by username (prefix).                                              |
| GET    | `/api/v1/admin/users/:id`         | admin (cookie + CSRF) |          | P5.14: a person's record: status, history, recent content (never their email).          |
| POST   | `/api/v1/admin/users/:id/actions` | admin (cookie + CSRF) |          | P5.6 / P5.14: strike, suspend, ban, lift, note, or cancel a strike.                     |
