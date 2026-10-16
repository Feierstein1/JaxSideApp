# Manual test checklist (phone + admin portal)

The server behavior behind every item here is already covered by automated tests and by
`npm run e2e:live -w @jax/server`, which plays temporary people through the whole app over
real HTTP and then deletes them (91 checks; see `docs/TESTING.md`). This list is what a
person needs to check on a real phone: screens, wording, GPS, permissions, and how it feels.

**Before you start:** dev server and Expo running (`npm run dev`, `npm run dev:mobile`), Docker
services up, phone on the same Wi-Fi. Emails (codes) arrive in Mailpit at
http://localhost:8025. Use a second account (or a second phone/emulator) for the two-person
checks. Tick each box when it looks right; note anything odd next to it.

## 1. First launch and location

- [ ] The app asks for location **once**, with an explanation first.
- [ ] Choosing "Only this time": it asks again next launch (expected).
- [ ] Denying location shows the explanation screen with **Open Settings**; Account and sign out
      still work.
- [ ] Allowing location goes straight to the Home feed.

## 2. Sign up, confirm, sign in

- [ ] Create an account: under 18 is refused with a clear message; the Terms / Privacy /
      Guidelines links open.
- [ ] Sign in before confirming: Home shows the "Confirm your email" banner; posting asks you to
      confirm first.
- [ ] Enter the 6-digit code from Mailpit in Account → Settings: the banner disappears.
- [ ] Wrong password shows an error; the **Show** button reveals what you typed.
- [ ] Forgot password: the code from Mailpit resets it; the old password stops working.

## 3. Guest mode (view-only)

- [ ] Sign out → **Continue as guest**: the top bar says **GUEST**.
- [ ] The Places tab is hidden.
- [ ] You can scroll the area feed and open posts to read comments.
- [ ] There's no comment box (a "Sign up to comment" button instead), no Report links, and
      tapping a vote arrow or **+** explains you need an account.
- [ ] Account shows the guest explanation; **Sign up or sign in** returns to sign-in.

## 4. Home feed and posting

- [ ] New / Top this week switch works; scrolling loads more; pull down refreshes.
- [ ] With no posts nearby, the "No posts in this area yet" message and button show.
- [ ] **+** opens New post; posting returns to the feed with your post at the top.
- [ ] Posting again within 10 seconds shows "You're doing that too often. Try again in…".
- [ ] Posting the exact same text again is refused ("You already posted this").
- [ ] Open your post: **Delete my post** works (after confirming).
- [ ] The top-bar username shows; the eye button hides it and it stays hidden after restarting.

## 5. Comments, votes, reports (two accounts)

- [ ] Account B comments on A's post; A replies to B; replies are indented (max 3 levels).
- [ ] Up/down votes change color and score; tapping your vote again clears it.
- [ ] Delete your own comment: it shows "[deleted]" if it had replies.
- [ ] B reports A's post (**Report post**) and a comment (**Report**): the sheet shows reasons,
      details, and the "call 911" note for Child safety; then "Thanks for reporting".
- [ ] B's Account → Settings → **My reports** lists them as "Waiting for review".

## 6. Screening and spam

- [ ] Comment "I know where you live": you see **Sent for review**, and the other account
      doesn't see the comment.
- [ ] A post with 3 web links is sent for review.
- [ ] (After adding a WARN rule in the database or, later, the portal) a matching post asks
      **Post anyway?**, and choosing it posts.

## 7. Places and business rooms

- [ ] The Places list loads with distance; category chips filter it; sort options work; search
      finds a place by name.
- [ ] Star a place; it appears under Account → Settings → Favorite places.
- [ ] Each place row shows its post count.
- [ ] Within about 0.3 mi of a place, its discussion opens and you can post; farther away you see
      the "get closer" message.
- [ ] iPhone only: the Map view shows pins (hidden on Android for now, Q13).

## 7b. Suggest a place

- [ ] Places → **Missing a place? Suggest it** (bottom of the list) opens the form, which says your
      current location is used as the pin.
- [ ] Typing the name of a place that's already listed nearby shows **Already listed nearby?**;
      tapping one opens that place.
- [ ] Pick a category, send: "Thanks for the suggestion". It's **not** in the Places list yet.
- [ ] Account → Settings → **My suggestions** shows it as "Waiting for review".
- [ ] In the portal (section 10), **Places** shows it with a small map. Approve it: it appears in
      the app's Places list, and My suggestions says "Approved". Reject another with a reason:
      My suggestions shows the reason.

## 8. Profiles and blocking

- [ ] Tap a username on a post or comment: profile shows bio, join date, post count, recent posts.
- [ ] **Block**: their posts and comments disappear for you, and they can't open your profile.
- [ ] Account → Settings → **Blocked users** lists them; **Unblock** brings everything back.

## 9. Account settings

- [ ] Profile tab: add/edit a bio (300 characters max).
- [ ] Change username: works once; a second change soon after is refused with the date.
- [ ] Change email: code goes to the new address (Mailpit); the old address gets a notice.
- [ ] Change password: other signed-in devices are signed out; this one stays signed in.
- [ ] Feed radius and business radius options save.
- [ ] Policies (Terms, Privacy, Guidelines, Data Retention) open and read well.
- [ ] Location → **Open phone settings** opens the app's settings.
- [ ] **Account standing** says "good standing" with the How it works text.
- [ ] Delete account (password + type DELETE) signs you out; that account can't sign in again.

## 10. Admin portal (on your computer)

- [ ] Make yourself admin: `npm run admin:promote -w @jax/server -- <your username>`.
- [ ] Open http://localhost:3000/admin → redirected to sign-in; password, then scan the QR code
      with an authenticator app and enter the code. Next sign-in only asks for the code.
- [ ] Dashboard counts match what's waiting; the tiles link to the queues.
- [ ] Reports: the item reported in section 5 is there; the held comment from section 6 shows
      **Held** and **Automatic**.
- [ ] Open a case: you see the content, the post it's on, who reported it, and the author's history.
- [ ] **Remove** with "Also give the author a strike": on the author's phone, Account standing
      shows the warning with your reason; the reporter's My reports says "Action taken".
- [ ] **Approve (publish)** the held comment: it appears on the phone.
- [ ] Users: search by username; the record shows previous usernames and history (never email).
- [ ] Give a second strike (suspends 24 h): the phone shows "suspended until …" and signing in
      offers **See why and appeal**; send an appeal.
- [ ] Appeals: accept it with a note; the person can sign in again and sees the note.
- [ ] Audit log lists everything you did. **Sign out** ends the session.
