# API reference

Generated from the route files by `npm run docs:api -w @jax/server`; don't edit by hand.
182 endpoints.

- **Who:** `public` (no session), `user` (app session: `Authorization: Bearer <token>`),
  `user (confirmed email)`, `user or guest` (guests are view-only, D54), `admin` (portal cookie;
  changes also need the `X-CSRF-Token` header; off in production unless enabled, D62).
- **Location:** the body carries a fresh `reading` (`latitude`, `longitude`, `accuracyMeters`,
  `timestamp`, optional `mocked`); the server checks Duval and any radius (§6).
- Every request body is a strict JSON schema in `@jax/shared` (unknown fields → 400). Errors look
  like `{ "error": { "code", "message", "details"? } }`; rate limits answer 429 with `Retry-After`.
- The app also sends `X-Installation-Token` (from `POST /installations`) for ban carry-over.


## ad-images

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/ad-images/:id` | signed link (from a post or profile) |  | D206: serves an ad's image or GIF through a short-lived signed link (ad cards carry the links). Expired or forged links get 403; removed, unknown, or not on an approved ad: 404. |

## ads

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/ads` | public |  | D206 / B3.4: the ads to show on the screen the phone is on (guests too). |
| POST | `/api/v1/ads/:id/interest` | public |  | D206: Interested / Not interested on an ad (accounts only). |
| POST | `/api/v1/ads/views` | public |  | D206: a batch of ad views (counted once per person per ad per day). |

## badges

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/badges` | user |  | Q26: both top-bar badges in one request (chats with something unseen, and the bell), so the app's 30 s check is one request and one rate-limit counter instead of two. The separate /messages/unread and /notifications/unread stay for older app versions. |

## business-pictures

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/business-pictures/:id` | signed link (from a post or profile) |  | D189: serves a business login's profile picture through a short-lived signed link ("The Owner" posts and replies carry the links). Expired or forged links get 403; removed, replaced or unknown pictures 404. |

## contact

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/contact` | user or guest |  | D90: Contact us: a support ticket or a general message, read in the admin portal. |

## friends

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/friends` | user |  | D76: your friends (private to you). |
| DELETE | `/api/v1/friends/:username` | user |  | D76: remove a friend. |
| GET | `/api/v1/friends/activity` | user |  | D76 / D89: the friends feed ("@name posted near Avondale"), last 3 days; `q` narrows it to friends whose username starts with it. No post text or coordinates. |
| GET | `/api/v1/friends/requests` | user (confirmed email) |  | D76: requests waiting on you (incoming) and on others (outgoing). |
| POST | `/api/v1/friends/requests` | user (confirmed email) |  | D76: send a friend request (accepts theirs if they already asked you). |
| DELETE | `/api/v1/friends/requests/:id` | user |  | D76: withdraw a request you sent. |
| POST | `/api/v1/friends/requests/:id/accept` | user |  | D76: accept a friend request sent to you. Only the person asked can answer it. |
| POST | `/api/v1/friends/requests/:id/decline` | user |  | D76: decline a friend request sent to you. Only the person asked can answer it. |

## map

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/map` | user |  | D99: where the app loads the Places map from (signed links, about a day). |
| GET | `/api/v1/map/font` | public |  | D113: the icon font the map page draws its markers with (Ionicons, MIT). Public, like any web font; the phone keeps it for a week. |
| GET | `/api/v1/map/page` | public |  | D99: the map page for the app's WebView (signed link from GET /map). |
| GET | `/api/v1/map/tiles` | public |  | D99: the Duval map tiles (one PMTiles file), read in byte ranges by the map page. Signed links only; the file never leaves in one piece. |

## messages

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/messages` | user (confirmed email) | yes | D98: your chats, newest first. |
| POST | `/api/v1/messages` | user (confirmed email) | yes | D98: send a message to a friend (text and/or photos). Mutual friends only, inside Duval, screened like posts but never held: refused or sent. |
| POST | `/api/v1/messages/:id/hide` | user |  | D98: "Delete for me": hide one message from your own view. |
| POST | `/api/v1/messages/:id/unsend` | user |  | D98: unsend your own message within 15 minutes (gone for both). |
| POST | `/api/v1/messages/conversations/:id/hide` | user |  | D98: "Delete chat for me": hides everything so far; new messages still arrive. |
| GET | `/api/v1/messages/unread` | user |  | D98: how many chats have a message you haven't seen (the top-bar badge). |
| GET | `/api/v1/messages/with/:username` | user |  | D98: your chat with someone (newest 50, or older with `before`). Opening it marks it read. |

## notifications

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/notifications` | user |  | D76: your notifications, newest first. |
| POST | `/api/v1/notifications/read` | user |  | D76: mark all your notifications read (opening the bell does this). |
| GET | `/api/v1/notifications/unread` | user |  | D76: the bell's badge. The app asks about every 30 s while open. |

## owner-claims

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/owner-claims/:id/cancel` | user |  | D103: withdraw your own claim (to start over another way). |
| POST | `/api/v1/owner-claims/:id/confirm` | user |  | D103: enter the code from the business email or the admin's phone call (your claim only). |
| POST | `/api/v1/owner-claims/:id/proof` | user |  | D103: where you posted the code (website or official social page); an admin checks it. |

## polls

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/polls` | user or guest |  | D123 / D124: open polls (with your answers, if any) and recently closed ones with their results. `?topic=prices` narrows both to one topic (an unknown topic is ignored). |
| GET | `/api/v1/polls/:id` | user or guest |  | D123: one poll; results (per choice and ZIP) once it has closed. |
| POST | `/api/v1/polls/:id/vote` | user (confirmed email) | yes | D123: one final vote. Confirmed accounts a few days old, from inside Duval. The vote is stored under a per-poll code with the voter's ZIP; the ID and the reading are not. |
| POST | `/api/v1/polls/suggestions` | user (confirmed email) |  | D133: suggest a poll question; the admin uses it or declines it. Confirmed accounts. |

## chat

D218: live area chat. Text only, temporary, one room per map cell of about a mile. Confirmed accounts only (guests and unconfirmed accounts are refused). The room comes from the verified location; the client cannot pick one. A room is open only when an admin has switched it on and at least 2 people were about in the last 10 minutes.

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/chat/status` | user (confirmed email) | yes | Where you are and whether chat is open there: `{ open, room: { title, zip }, people }` (`people` is "a few" under 5, the number from 5). Also counts you as present. |
| POST | `/api/v1/chat/messages/list` | user (confirmed email) | yes | The room's lines, oldest first; `after` (ISO time) returns only newer ones. A line is `{ id, username, admin, createdAt, body }`: no pictures, IDs or places. `CHAT_CLOSED` (403) when off or too quiet. |
| POST | `/api/v1/chat/messages` | user (confirmed email) | yes | Say something: 1 to 200 plain-text characters, links of any kind refused (D219), forbidden words refused, the same line twice refused. 1 per 3 s, 10 per minute, 100 per hour. Breaking a rule (a word, a link, a repeat, passing the minute or hour cap) gets 2 warnings, then a mute of 10 minutes, an hour, the rest of the day (`CHAT_MUTED`, 403; reading still works; `mutedUntil` is in the status and list responses). Lines expire after 23 hours; a room keeps its newest 40 (up to 150 while under 30 minutes old). |
| POST | `/api/v1/reports` with `target: { type: "chat", username }` | user (confirmed email) | yes | D218: report someone's chat lines (you must be in the same room). Copies their last 20 lines into the report as evidence; reasons as for other reports. |
| POST | `/api/v1/admin/chat/users/:id/unmute` | admin | no | Lift someone's chat mute early (a reason is audited). |
| POST | `/api/v1/admin/chat/rooms/:id` | admin | no | Switch a room on or off, or rename it (`action`: `enable`, `disable`, `rename`; a reason is audited). |

## topics

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/topics` | user or guest | yes | D125: open city topics (pinned first) and closed ones. Accounts and guests. |
| POST | `/api/v1/admin/topics/approval` | admin | no | D222: make topics need admin approval (`required: true`) or appear at once (`false`); a reason is audited. |
| POST | `/api/v1/topics` | user or guest | yes | D133: create a topic (D222: while approval is on it comes back 202 `{ held, pending, message }` and waits for an admin; staff are never held): city (anywhere in Duval) or local (placed at your coarsened location; seen and posted in within half a mile). Confirmed accounts; screened like posts. |
| GET | `/api/v1/topics/:id` | user or guest |  | D125: one city topic. D133: local topics are opened through their posts list, which checks that you're nearby, so they aren't served here. |
| PATCH | `/api/v1/topics/:id` | user or guest |  | D134: the creator shows or hides their username on the topic (the only change allowed; the title, description and category can't be edited). |
| DELETE | `/api/v1/topics/:id` | user or guest |  | D134: the creator deletes their topic (hidden at once; purged with its posts in a week). |
| PUT | `/api/v1/topics/:id/follow` | user |  | D133: follow a topic (it appears in your Following list). |
| DELETE | `/api/v1/topics/:id/follow` | user |  | D133: stop following a topic. |
| POST | `/api/v1/topics/:id/posts/list` | user or guest | yes | D125: a topic's posts (a read; POST because it carries the location reading). |
| GET | `/api/v1/topics/allowance` | user |  | D162: can this account start a topic of this kind right now? The app asks before opening the form, so someone still in a waiting period gets one short notice instead of a form that fails. Creating a topic checks the same rules again. |
| POST | `/api/v1/topics/list` | user or guest | yes | D133: topics of one kind (city or local), newest or oldest first, 20 at a time, with search, category and Following filters. Local topics: only those within half a mile of you. A read (POST because it carries the location reading). |
| GET | `/api/v1/topics/suggestions` | user (confirmed email) |  | D125: your topic suggestions and what happened to them. |
| POST | `/api/v1/topics/suggestions` | user (confirmed email) |  | D125: suggest a citywide topic; it waits for the admin. Confirmed accounts, 3 a day. |

## videos

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/videos` | user (confirmed email) |  | D102: upload one video (the MP4/MOV bytes as the body, up to 30 s and 25 MB). Confirmed users only; shares the daily upload limit; checked and cleaned before storing. Attach it to a post by ID. |

## voice

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/voice` | user (confirmed email) |  | D75: upload one voice clip (the .m4a bytes as the body). Confirmed users only; shares the daily upload limit with photos; checked before storing. Attach it to a post by ID. |

## health

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/health` | public |  |  |

## installations

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/installations` | public |  | P2.7: the app calls this once, on first launch, and keeps the token in secure storage. |

## auth

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | public |  |  |
| POST | `/api/v1/auth/logout` | user |  | Signs out this device only. |
| POST | `/api/v1/auth/password-reset/confirm` | public |  |  |
| POST | `/api/v1/auth/password-reset/confirm-code` | public |  | D31: reset the password in the app with email + 6-digit code + new password. |
| POST | `/api/v1/auth/password-reset/request` | public |  | Always 202 with the same body, whether or not the email has an account. |
| POST | `/api/v1/auth/register` | public |  |  |
| DELETE | `/api/v1/auth/sessions` | user |  | Signs out everywhere: revokes every session for the caller, including this one. |
| POST | `/api/v1/auth/verify-email` | public |  | No session needed: the single-use emailed token is the credential. |
| POST | `/api/v1/auth/verify-email/code` | user |  | D31: confirm email in the app with the 6-digit code. Session required (no verified email needed). |
| POST | `/api/v1/auth/verify-email/resend` | user |  |  |

## session

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/session` | user or guest |  | Who the app is signed in as: a registered user, or a guest with its expiry (P4.4). |

## guests

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/guests` | public |  | P4.1: start (or resume) guest mode on this app installation. The guest token is used like a session token; the internal guest ID is never returned (P4.3). |

## me

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/me` | user |  | The caller's own account. Private view (includes their email), still via a serializer. |
| POST | `/api/v1/me/appeals` | user |  | P5.7: appeal a warning (or other strike) while signed in. |
| PATCH | `/api/v1/me/area-stats` | user |  | D116: "Leave me out of area statistics" (Account → Settings). |
| PUT | `/api/v1/me/avatar` | user (confirmed email) |  | P6.5: set your profile photo to one you uploaded (same pipeline as post photos). |
| DELETE | `/api/v1/me/avatar` | user (confirmed email) |  | Remove your profile photo. |
| GET | `/api/v1/me/blocks` | user |  | P4.11: the people you've blocked (settings). |
| PATCH | `/api/v1/me/color` | user |  | D69: change your account color (one of the palette in @jax/shared). |
| POST | `/api/v1/me/delete` | user |  | P4.12: delete your account (password, plus typing DELETE). |
| POST | `/api/v1/me/email` | user |  | P4.10: start an email change (a code is sent to the new address). |
| POST | `/api/v1/me/email/confirm` | user |  | P4.10: finish an email change with the code. |
| GET | `/api/v1/me/favorites` | user |  | P2.14: the caller's saved places. Part of account settings, so no location needed (D16). |
| PATCH | `/api/v1/me/friend-privacy` | user |  | D76: "Hide my recent posts from friends" (the friends feed leaves you out). |
| GET | `/api/v1/me/giveaways` | user |  | D188: your giveaway wins (your own email shown masked, to check it's right). |
| POST | `/api/v1/me/giveaways/:id` | user |  | D188: accept or decline a giveaway prize (yours only, before the deadline). |
| GET | `/api/v1/me/guides` | user |  | D104: which first-time guides you've finished, per account (so a new phone or a reinstall doesn't show them again). A guide whose version went up shows once more. |
| POST | `/api/v1/me/guides` | user |  | D104: "Got it" on a guide: remember it (at the guide's current version). |
| GET | `/api/v1/me/medals` | user |  | P6.9: your own medals (Account → Profile). |
| POST | `/api/v1/me/password` | user |  | P4.10: change password; other devices are signed out. Wrong guesses are rate-limited. |
| PATCH | `/api/v1/me/preferences` | user |  | P2.15 / D71: your radius (0.1, 0.2 or 0.3 mi). One setting for the feed, the Places list and business discussions; the server never allows more than 0.3 mi. |
| PATCH | `/api/v1/me/profile` | user |  | P4.8 (early): edit your own public bio. Plain text (P3.10); empty clears it. |
| GET | `/api/v1/me/reports` | user |  | P4.11 / P5.1: the reports you've sent and their status. |
| GET | `/api/v1/me/standing` | user |  | P5.6: your warnings and suspensions that still count, the reason given, and appeals (P5.7). |
| GET | `/api/v1/me/submissions` | user |  | P5.8: your suggested places and how they went. |
| PATCH | `/api/v1/me/username` | user |  | P4.9: change your username. Cooldown applies; your account ID and history stay the same. |

## users

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/users/:username` | user or guest | yes | P4.8: a public profile and the person's recent area posts. Like the feed, it needs an in-Duval reading (D16); guests may view profiles too. D105: your own profile works from anywhere and lists all your posts (area and place). |
| PUT | `/api/v1/users/:username/block` | user |  |  |
| DELETE | `/api/v1/users/:username/block` | user |  |  |

## location

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/location/status` | user | yes | P2.9: "Can I use location features where I am?" Runs the full server location check for reading content (D16) and returns 200, or 403 with the specific reason. POST so the coordinates travel in the body, never in a URL or access log. |

## feed

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/feed` | user or guest | yes | P3.1: the general feed around the reader's verified location. |

## posts

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/posts` | user (confirmed email) | yes | P3.1: create a general post. |
| POST | `/api/v1/posts/:id` | user or guest | yes | P3.1 / P3.8: read a general post with comments (POST: carries a location), edit, delete. |
| PATCH | `/api/v1/posts/:id` | user (confirmed email) |  | PATCH: author edits their own post (P3.8). No location check: content already placed. |
| DELETE | `/api/v1/posts/:id` | user |  | DELETE: author soft-deletes their own post (P3.8). |
| POST | `/api/v1/posts/:id/comments` | user (confirmed email) | yes | POST /…/:id/comments: comment or reply (P3.3, D20 / D19). Registered users only (D54). |
| PUT | `/api/v1/posts/:id/vote` | user (confirmed email) | yes | PUT /…/:id/vote: up, down or clear (P3.4, D6). |

## comments

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| PATCH | `/api/v1/comments/:id` | user (confirmed email) |  | P3.8: authors edit or delete their own comments. |
| DELETE | `/api/v1/comments/:id` | user |  | P3.8: authors edit or delete their own comments. |
| PUT | `/api/v1/comments/:id/vote` | user (confirmed email) | yes | PUT /comments/:id/vote: same location rule as voting on the comment's post. |

## business-posts

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/business-posts/:id` | user | yes | P3.2 / P3.8: a business-room post (readable within 0.3 mi of its place, D19). |
| PATCH | `/api/v1/business-posts/:id` | user (confirmed email) |  | PATCH: author edits their own post (P3.8). No location check: content already placed. |
| DELETE | `/api/v1/business-posts/:id` | user |  | DELETE: author soft-deletes their own post (P3.8). |
| POST | `/api/v1/business-posts/:id/comments` | user (confirmed email) | yes | POST /…/:id/comments: comment or reply (P3.3, D20 / D19). Registered users only (D54). |
| PUT | `/api/v1/business-posts/:id/vote` | user (confirmed email) | yes | PUT /…/:id/vote: up, down or clear (P3.4, D6). |

## places

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/places/:id` | user | yes | P2.13: one place's info and distance. Body carries the reading, so it's a POST. |
| PUT | `/api/v1/places/:id/favorite` | user |  |  |
| DELETE | `/api/v1/places/:id/favorite` | user |  |  |
| GET | `/api/v1/places/:id/friends-favorited` | user |  | D74/D76: which of your friends favorited this place (everyone else sees only the count). |
| GET | `/api/v1/places/:id/owner-claims` | user (confirmed email) |  | D103: your owner claims for this place, and which ways to verify it supports. |
| POST | `/api/v1/places/:id/owner-claims` | user (confirmed email) |  | D103: "I own this place". EMAIL sends a code to an address at the business's own web domain; WEBSITE gives a code to post publicly; PHONE has an admin call the business. |
| GET | `/api/v1/places/:id/owner-team` | user (confirmed email) |  | D157: the place's owner team (only its members can see it). |
| POST | `/api/v1/places/:id/owner-team` | user (confirmed email) |  | D157: the primary owner adds a team member by username. |
| PATCH | `/api/v1/places/:id/owner-team/:claimId` | user (confirmed email) |  | D157: change a staff name (the primary owner for anyone, a member for themselves). |
| DELETE | `/api/v1/places/:id/owner-team/:claimId` | user (confirmed email) |  | D157: the primary owner removes a team member. |
| POST | `/api/v1/places/:id/posts` | user (confirmed email) | yes | P3.2: post in a place's room (within 0.3 mi, D19). |
| POST | `/api/v1/places/:id/posts/list` | user | yes | P3.2: a place's room, newest first (within 0.3 mi, D19). |
| PUT | `/api/v1/places/:id/rating` | user (confirmed email) | yes | D144: like (+1), dislike (-1) or take back (0) your vote on a place. Only while you're there (within the place radius), one vote per account (changeable), accounts a few days old, never on your own place, and not while an admin has voting locked. |
| POST | `/api/v1/places/:id/removal` | user (confirmed email) | yes | D94: "Closed or doesn't exist?" Opens a removal request (or joins the open one) with your "closed" vote. You must be within 528 yd of the place. |
| POST | `/api/v1/places/changes` | user | yes | D94: "Verify changes near you": suggested places and removal requests within 528 yd. |
| POST | `/api/v1/places/changes/vote` | user (confirmed email) | yes | D94: one final vote on a suggested place ("It's here" / "Not here") or a removal request ("Closed" / "Still open"). Confirmed accounts a few days old, standing within 528 yd. |
| POST | `/api/v1/places/search` | user | yes | P2.13: search the directory. Needs a fresh in-Duval reading (D16); no radius (D19). |

## submissions

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/submissions` | user (confirmed email) | yes | P5.8: suggest a missing place (D63). The pin is the reading, which must be inside Duval. Limits (daily, pending, account age) are checked in the service. |
| POST | `/api/v1/submissions/check` | user | yes | P5.9: before suggesting a place, show listed places that might be the same one. |

## photos

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/photos` | user (confirmed email) |  | P6.1/P6.2: upload one photo (the raw image bytes as the body). Registered users with a confirmed email only; rate-limited; the server checks and re-encodes it before anything is stored (D65). Returns an ID to attach to a post or set as your avatar. |
| GET | `/api/v1/photos/:id` | signed link (from a post or profile) |  | P6.4: serves a photo through a short-lived signed link (posts and profiles carry the links; the storage bucket itself is private). Expired or forged links get 403; removed, unattached-and-stale, or unknown photos 404. |

## reports

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/reports` | user | yes | P5.1: report a post, comment or profile. Registered users only (guests are view-only, D54). Needs an in-Duval reading like viewing does (D16). |

## appeals

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/appeals/restricted` | username + password (banned/suspended) |  | P5.7: a banned or suspended person appeals (password instead of a session, D59). |
| POST | `/api/v1/appeals/restricted/standing` | username + password (banned/suspended) |  | P5.7: a banned or suspended person sees why, and what they can appeal. |

## admin

| Method | Path | Who | Location | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/admin/ads/:id/decision` | admin (cookie + CSRF) |  | B3.3 / D206: approve an ad or turn it down (with a reason). Audited. |
| GET | `/api/v1/admin/appeals` | admin (cookie + CSRF) |  | P5.7 / P5.14: appeals waiting (or decided). |
| POST | `/api/v1/admin/appeals/:id` | admin (cookie + CSRF) |  | P5.7: accept (cancels the strike) or reject an appeal, with a note the person sees. |
| GET | `/api/v1/admin/audit` | admin (cookie + CSRF) |  | P5.16: the admin audit log, newest first. |
| GET | `/api/v1/admin/business-pictures/:id` | admin (cookie + CSRF) |  | D189: moderators can see a business login's picture, including after it's removed. |
| POST | `/api/v1/admin/businesses/:id` | admin (cookie + CSRF) |  | B1.7: suspend, lift, revoke or reset the password of a business login. Audited. |
| POST | `/api/v1/admin/businesses/:id/strikes` | admin (cookie + CSRF) |  | D191: a strike on a business login (or "Notify" from a report), or cancelling one. Audited. |
| POST | `/api/v1/admin/businesses/:id/subscription` | admin (cookie + CSRF) |  | B3.1: give a business a plan for free (replaces its current one). Audited. |
| POST | `/api/v1/admin/businesses/:id/subscription/end` | admin (cookie + CSRF) |  | B3.1: end a business's current plan now. Audited. |
| POST | `/api/v1/admin/businesses/places/:id/owner` | admin (cookie + CSRF) |  | B1.7: move a place to another business owner account. Audited. |
| GET | `/api/v1/admin/cases` | admin (cookie + CSRF) |  | P5.14: the moderation queue (open reports grouped by item, most urgent first). |
| GET | `/api/v1/admin/cases/:type/:id` | admin (cookie + CSRF) |  | P5.14: one case with its reports, context and the author's history. |
| POST | `/api/v1/admin/cases/:type/:id` | admin (cookie + CSRF) |  | P5.14: decide the case (remove, approve, dismiss, escalate), optionally with a strike. |
| POST | `/api/v1/admin/contact/:id` | admin (cookie + CSRF) |  | D90: mark a Contact us message resolved (or open again). |
| GET | `/api/v1/admin/contact/:id/reply-email` | admin (cookie + CSRF) |  | D90: the sender's account email, only if they allowed replies on this message. Every viewing is written to the audit log. |
| GET | `/api/v1/admin/giveaways` | admin (cookie + CSRF) |  | D188: every giveaway and its winners. |
| POST | `/api/v1/admin/giveaways` | admin (cookie + CSRF) |  | D188: create a giveaway with its criteria. |
| GET | `/api/v1/admin/giveaways/:id` | admin (cookie + CSRF) |  | D188: one giveaway: criteria, winners, and the eligible accounts (`?page=`, 50 a page). |
| POST | `/api/v1/admin/giveaways/:id` | admin (cookie + CSRF) |  | D188: draw winners at random, pick one by hand, or cancel the giveaway. |
| POST | `/api/v1/admin/giveaways/:id/winners/:winnerId` | admin (cookie + CSRF) |  | D188: reveal an accepted winner's email (reason audited), mark the prize sent, disqualify. |
| POST | `/api/v1/admin/login` | public |  | P5.11 step 1: password. Returns a short-lived challenge (and 2FA setup the first time). |
| POST | `/api/v1/admin/login/verify` | public |  | P5.11 step 2: authenticator code. Starts the admin session (cookies). |
| POST | `/api/v1/admin/logout` | admin (cookie + CSRF) |  | P5.11: end the admin session. |
| POST | `/api/v1/admin/owner-claims/:id` | admin (cookie + CSRF) |  | D103: approve or reject an owner claim, or take a verified owner's tag away. Audited. |
| POST | `/api/v1/admin/owner-claims/:id/business-invite` | admin (cookie + CSRF) |  | D172: (re)send a verified primary owner the business-site invite. Audited. |
| GET | `/api/v1/admin/photos/:id` | admin (cookie + CSRF) |  | P6.5: moderators can see a reported photo, including after it's removed. |
| POST | `/api/v1/admin/places` | admin (cookie + CSRF) |  | D146: add a place now (inside Duval), without a suggestion or votes. Audited. |
| POST | `/api/v1/admin/places/:id/ratings` | admin (cookie + CSRF) |  | D144: lock or unlock voting on a place, or clear all its votes (abuse). Audited. |
| POST | `/api/v1/admin/places/:id/remove` | admin (cookie + CSRF) |  | D146: take any place down now (no request needed). Keep in Removals undoes it. Audited. |
| POST | `/api/v1/admin/plans` | admin (cookie + CSRF) |  | B3.1: a new subscription plan. Audited. |
| POST | `/api/v1/admin/plans/:id` | admin (cookie + CSRF) |  | B3.1: change a plan (applies to everyone on it). Audited. |
| POST | `/api/v1/admin/poll-suggestions/:id` | admin (cookie + CSRF) |  | D133: mark a suggested poll question used, or decline it with a reason. |
| POST | `/api/v1/admin/polls` | admin (cookie + CSRF) |  | D123: write a new poll (question, 2–6 choices, open and close times). |
| PATCH | `/api/v1/admin/polls/:id` | admin (cookie + CSRF) |  | D123: change a poll before it opens. |
| DELETE | `/api/v1/admin/polls/:id` | admin (cookie + CSRF) |  | D123: delete a poll before it opens. |
| POST | `/api/v1/admin/polls/:id/end` | admin (cookie + CSRF) |  | D123: end an open poll now; it's counted right away. |
| POST | `/api/v1/admin/polls/:id/feature` | admin (cookie + CSRF) |  | D150: make a poll the Poll of the week (Home shows it first), or stop. Audited. |
| POST | `/api/v1/admin/removals/:id` | admin (cookie + CSRF) |  | D94: overrule the community: keep (or restore) the place, or take it down now. |
| POST | `/api/v1/admin/screening` | admin (cookie + CSRF) |  | P15.9: add a screening term. The term itself isn't copied into the audit log. |
| PATCH | `/api/v1/admin/screening/:id` | admin (cookie + CSRF) |  | P15.9: turn a screening term on or off, or change what it does. |
| POST | `/api/v1/admin/screening/test` | admin (cookie + CSRF) |  | P15.9: try a sentence against the rules (nothing is saved). |
| GET | `/api/v1/admin/submissions` | admin (cookie + CSRF) |  | P5.12: the submission queue with filters, duplicate candidates and submitter history. |
| POST | `/api/v1/admin/submissions/:id` | admin (cookie + CSRF) |  | P5.12 / P5.13: approve (optionally corrected), reject with a reason, or merge. |
| POST | `/api/v1/admin/submissions/bulk` | admin (cookie + CSRF) |  | P5.12: approve or reject a selected batch (the page lists them for confirmation first). |
| GET | `/api/v1/admin/summary` | admin (cookie + CSRF) |  | P5.11: counts for the admin dashboard. |
| POST | `/api/v1/admin/topics` | admin (cookie + CSRF) |  | D125: create a citywide topic (open now, or from a start time). |
| PATCH | `/api/v1/admin/topics/:id` | admin (cookie + CSRF) |  | D125: change a topic's wording, pin, start or end. |
| POST | `/api/v1/admin/topics/:id/decide` | admin (cookie + CSRF) |  | D125: approve or reject a suggestion; close or reopen a topic. |
| GET | `/api/v1/admin/users` | admin (cookie + CSRF) |  | P5.14: find people by any part of the username; filter by strikes, banned, suspended. |
| GET | `/api/v1/admin/users/:id` | admin (cookie + CSRF) |  | P5.14: a person's record: status, history, recent content (never their email). |
| POST | `/api/v1/admin/users/:id/actions` | admin (cookie + CSRF) |  | P5.6 / P5.14: strike, suspend, ban, lift, note, or cancel a strike. |
