# Manual test checklist (phone + admin portal)

The server behavior behind every item here is already covered by automated tests and by
`npm run e2e:live -w @jax/server`, which plays temporary people through the whole app over
real HTTP and then deletes them (98 checks; see `docs/TESTING.md`). This list is what a
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
- [ ] **Near [neighborhood] (D72):** the top of Home and of Places shows a gold pin and "Near …" with a
      sensible name for where you are (it's approximate near borders). Note any wrong or missing
      names; we can pin them.

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
- [ ] **Refresh (D73):** the round-arrow button top-right on Home (and right of the Places search box)
      reloads with a new location.
- [ ] **Walking (D77):** with the app open on Home, walk a block (60+ yd): within about 30 s the
      feed reloads on its own and the "Near …" label updates.
- [ ] **No connection (D77):** turn on airplane mode and tap refresh: the old posts disappear and
      "Could not reach the server" shows with **Try again**.
- [ ] **Reopen (D73):** switch to another app, walk a block (60+ yd), come back: Home and Places
      reload on their own. Come back without moving: nothing reloads.
- [ ] **Search (D74):** type in the search box on Home: post text or `@username` finds nearby
      posts only; no match shows "No posts nearby match…".
- [ ] Tapping refresh more than 30 times in a minute shows "Slow down a little".
- [ ] With no posts nearby, the "No posts in this area yet" message and button show.
- [ ] **+** opens New post; posting returns to the feed with your post at the top.
- [ ] Posting again within 10 seconds shows "You're doing that too often. Try again in…".
- [ ] Posting the exact same text again is refused ("You already posted this").
- [ ] Open your post: **Delete my post** works (after confirming).
- [ ] The top-bar username shows; the eye button hides it and it stays hidden after restarting.
      While hidden, the ★ on your own posts is hidden too (D73).
- [ ] **Post look (D69):** each post has a header in the author's color (rounded top) with their
      photo, a larger username, a ★ on your own posts, and the time on the right ("5 min ago" up to
      3 days, then the date). Below: white post with black text, a colored 3 px border, and the
      votes/comments row under a colored line. Header text is white on dark colors, black on light.
- [ ] Change your color (section 9) and your username: your existing posts show the new ones.

## 4b. Photos

- [ ] New post → the dashed **photo** box asks for photo access once, then opens your library.
- [ ] Add up to 4 photos (thumbnails with an ✕ to remove); post: the first shows large in the feed,
      the rest as small squares.
- [ ] A **GIF** uploads and plays animated in the post (D74).
- [ ] An iPhone HEIC photo uploads fine (it's converted to JPEG).
- [ ] **Away from Wi-Fi (D73):** with `npm run dev:remote`, on cellular, a full-size camera photo
      uploads in a few seconds (it's shrunk on the phone first).
- [ ] Account → Profile → tap the circle (or **Add a photo**): pick and crop a square photo; it
      shows on your profile and to others who open your profile.
- [ ] On someone else's post, long-press a photo → the report sheet opens (type: photo).
- [ ] In the portal, the photo report shows the image; **Remove** makes it disappear in the app.

## 4c. Voice posts and type tabs (D75)

- [ ] New post → **Record a voice post**: the app asks for the microphone once; the timer counts
      up; tap to stop (or it stops at 1:00). The clip appears with play and a trash can.
- [ ] Post it with no text: it shows in the feed with a black play bar; play, pause and the time
      work, and starting one clip pauses any other.
- [ ] Add a photo, switch to **Voice**, record, tap **Post**: a warning says the photo won't be
      included, with **Go back** / **Post without photo** (D87). Same the other way round.
- [ ] On an iPhone (if you have one), clips play too.
- [ ] Home and place pages show **All / Text / Media / Voice** under the black bar; each tab only
      shows that kind of post ("No voice posts nearby yet" when empty).
- [ ] Report a voice post; in the portal its case page has an audio player.

## 5. Comments, votes, reports (two accounts)

- [ ] Account B comments on A's post; A replies to B; replies are indented (max 3 levels).
- [ ] Up/down votes change color and score; tapping your vote again clears it.
- [ ] On an opened post, "N up · N down" shows beside the score and updates when you vote (D83).
- [ ] Delete your own comment: it shows "[deleted]" if it had replies.
- [ ] B reports A's post (**Report post**) and a comment (**Report**): the sheet shows reasons,
      details, and the "call 911" note for Child safety; then "Thanks for reporting".
- [ ] B's Account → Settings → **My reports** lists them as "Waiting for review".
- [ ] **Auto-hide (D73):** three different accounts report the same post: it disappears from the
      feed right away. In the portal it shows **Held** with all three reporters and the author;
      **Approve (publish)** brings it back.

## 6. Screening and spam

- [ ] Comment "I know where you live": you see **Sent for review**, and the other account
      doesn't see the comment.
- [ ] A post with 3 web links is sent for review.
- [ ] (After adding a WARN rule in the database or, later, the portal) a matching post asks
      **Post anyway?**, and choosing it posts.

## 7. Places and business rooms

- [ ] The Places list only shows places **within a mile**, on a dark grey background, each as
      its own card with a 2 px black border: a header in the **category's color** with a white
      category pill and the name (long names shrink), then distance (left) and post count (right).
      No "You're here" text, no map.
- [ ] The **filter** button sits left of the search box in the black bar; it opens sort and
      category options. Search finds a place by name.
- [ ] Each type has its own color (food red, coffee brown, bars purple, outdoors green, shopping
      magenta, things to do orange, services blue, hotels teal, other slate).
- [ ] Opening a place shows the same card (category color, pill, name, distance, posts) on a dark
      background. The **star** next to the name is white when not a favorite and gold when it
      is; tapping it shows "Added to favorites" / "Removed from favorites" briefly.
- [ ] Within 0.3 mi, the round gold **+** bottom-right writes a post there (no "Write a post here"
      link). Home uses the same round + button.
- [ ] Star a place; it appears under Account → Settings → Favorite places.
- [ ] Each place row shows its post count, and a ★ with how many people favorited it (D74).
      Filter → **Most favorited** puts the most-starred places first.
- [ ] Within about 0.3 mi of a place, its discussion opens and you can post; farther away you see
      the "get closer" message.
- [ ] No place names longer than 30 characters appear.

## 7b. Suggest a place

- [ ] Places → the round gold **+** bottom-right (Add new place) opens the form, which says your
      current location is used as the pin. Names over 30 characters are refused.
- [ ] Typing the name of a place that's already listed nearby shows **Already listed nearby?**;
      tapping one opens that place.
- [ ] Pick a category, send: "Thanks for the suggestion". It's **not** in the Places list yet.
- [ ] Account → Settings → **My suggestions** shows it as "Waiting for review".
- [ ] In the portal (section 10), **Places** shows it with a small map. Approve it: it appears in
      the app's Places list, and My suggestions says "Approved". Reject another with a reason:
      My suggestions shows the reason.

## 7c. Friends and notifications (D76, two accounts)

- [ ] A opens B's profile → gold **Add friend** under the profile card: it turns into a grey
      "Request sent · tap to cancel".
- [ ] Within about 30 s B's **bell** (round button left of the username, top-right) turns gold
      with a red number. Opening it shows a dark **Notifications** page with a back arrow; the
      request is under "Friend requests" with **Accept** / **Decline**, and the number clears.
- [ ] B accepts: both profiles show a teal **Friends ▾** button; A's bell lists "Accepted your
      friend request" under "Earlier". Tapping **Friends ▾** offers **Remove friend** (asks first).
- [ ] On Android, a friend's profile **•••** shows Block (or Unblock) and Report profile, nothing
      cut off.
- [ ] **Friends** tab (bottom bar, filled gold when active): a "Your friends" button at the top
      (gold "N new" when requests are waiting). After B posts in the area, A sees a dark card with
      B's color stripe: "**B** posted near **[area]**" and a teal pin; after a place post, "posted
      at **[place]**" with a gold storefront. The post text is never shown there. Empty: "No friend
      activity yet" with **Find friends**.
- [ ] B turns on Account → Friends → **Hide my posts from friends** (the line under it says "On:
      friends don't see where you post"): B's posts leave A's Friends tab.
- [ ] Friends tab → **Your friends**: type a username and tap the gold button beside it (a teal
      "Request sent" note appears); cancel a sent request; remove a friend from their **•••**.
- [ ] B favorites a place: on A's view of that place, a gold-tinted "Favorited by your friend
      **B**" line shows inside the place card, above **Save to favorites**.
- [ ] Open a post (not in a feed): next to the vote pill, a teal ▲ count and a gold ▼ count (D83).
- [ ] Blocking a friend removes the friendship. Guests don't see the Friends tab or the bell.

- [ ] **Friends tab switch (D89):** **Friend activity** / **Your friends**; the search box finds a
      friend's recent activity by username; activity only covers the last 3 days.
- [ ] Open a place from Friend activity, then tap the **Places** tab: the Places list shows (not
      that place). The place's back arrow also goes to the list.
- [ ] Places filter has **Gyms & fitness** (indigo, barbell icon).

## 7d. Verify changes: community place voting (D94)

- [ ] Run `npm run demo:data -w @jax/server -- --changes` (demo suggestions near your area posts).
- [ ] Near that spot, Places shows **Verify changes near you** at the top: a "New place?" card
      (Corner Taco Window, 3/10) and a "Closed?" card. Swipe sideways if there are more.
- [ ] Tap **It's here**: the card says "You voted…"; you can't vote again on it.
- [ ] Far away (more than 528 yd) the strip doesn't show; voting from too far is refused.
- [ ] On a place page within range, **Closed or doesn't exist?** asks first, then the place
      appears in the strip for others.
- [ ] Suggest a place: the message says people nearby will vote it in; My suggestions says
      "Waiting for votes nearby".
- [ ] Portal → **Places** shows each suggestion's votes; **Removals** lists requests with every
      vote (who, which way, how far) and **Restore place** / **Remove now**.

## 8. Profiles and blocking

- [ ] Tap a username on a post or comment: profile shows bio, join date, post count, recent posts.
- [ ] **Block**: their posts and comments disappear for you, and they can't open your profile.
- [ ] Account → Settings → **Blocked users** lists them; **Unblock** brings everything back.

## 9. Account settings

- [ ] Profile card: the band across the top is your color; the **Color** button opens 24 colors,
      and picking one changes the band (and your post stripes) right away.
- [ ] **About** and **Medals** have black title bars with white text, joined to white boxes with
      black text; **Edit bio** sits under the bio box on the left; add/edit a bio (300 max).
- [ ] Home: a black bar under the header holds New / Top this week; posts sit on dark grey.
- [ ] Opening a post (area or place) shows the post and its comments on the same dark grey; the
      "Comments" heading is white and Delete/Report links are gold.
- [ ] Change username: works once; a second change soon after is refused with the date.
- [ ] Change email: code goes to the new address (Mailpit); the old address gets a notice.
- [ ] Change password: other signed-in devices are signed out; this one stays signed in.
- [ ] **Radius** (Settings) offers 176 yd, 352 yd and 528 yd; picking a smaller one shrinks the feed and the Places list. Distances on posts and places show in yards (feet when very close).
- [ ] Policies (Terms, Privacy, Guidelines, Data Retention) open and read well.
- [ ] Location → **Open phone settings** opens the app's settings.
- [ ] **Account standing** says "good standing" with the How it works text.
- [ ] Delete account (password + type DELETE) signs you out; that account can't sign in again.

- [ ] **Contact us (D90):** Account → Help → **Contact us**: pick Support ticket or General, add a
      subject and message, send → "Thanks!". In the portal, **Messages** lists it; **Show reply
      email** appears only if you turned on "You can reply to my account email"; **Mark resolved**
      moves it to Resolved.

## 9b. Accessibility (P7.6)

- [ ] Phone settings → largest font size: screens still readable, nothing cut off or overlapping.
- [ ] Turn on **TalkBack** (Android) or **VoiceOver** (iPhone): buttons read sensible names
      ("Write a new post", "Upvote", "More options", "Hide my username"), and you can post and
      comment without looking.
- [ ] Phone setting **Remove animations** (Android) / **Reduce Motion** (iPhone) on: buttons,
      votes, sheets and toasts no longer move or bounce; loading placeholders hold still (D78).
- [ ] Text on the dark screens is white, grey, gold or light teal and easy to read.

## 9c. Look and feel (D78, D79)

- [ ] **Every screen is dark**: feeds, Places, a place, a post, profiles, Account and all its
      sub-pages, sign-in, register, reset password, the filter / report / color sheets and the
      policy pages. No white page anywhere (the only light things are the toast and photos).
- [ ] **Header:** the gold pin + **Jax** sits top-left on every screen (after the back arrow on
      inner screens); no "JAX", "PLACES" or "ACCOUNT" titles. Your @username pill is on the right.
- [ ] Text is in the new typeface (rounded, geometric). Headings and names are heavy.
- [ ] **Sign in:** Jax top-left, a big "Your neighborhood, live." welcome, then the form on a
      dark sheet. Fields have icons; the field you're typing in gets a gold outline.
- [ ] **Home:** under the header, "Near [neighborhood] · within 528 yd" (tap: opens Account),
      search pill + refresh, then All / Text / Media / Voice. Latest / Top this week scrolls
      away with the posts.
- [ ] **Posts:** dark cards with a thick stripe in the author's color down the left; photo
      ringed in that color; name, ★ on yours, medals; "5 min ago · 120 yd"; vote pill (teal
      when up, gold when down) and comment pill; "Voice" / "Photo" tag on the right; "Popular"
      at 10+ points. A navy or black account color still shows a visible stripe.
- [ ] **Places list:** each place is a dark card with a thick category-colored stripe, a colored
      icon tile, the name large, "Coffee · 120 yd", posts (teal) and ★ count, and "You can post"
      when you're close enough. Your favorites show a gold ★ next to the name.
- [ ] **Place page:** big tile and name, address, three tiles (Away / Posts / Favorites), a
      "Save to favorites" button (turns gold when saved, toast at the bottom). Too far away: a
      dashed lock card with your distance.
- [ ] **Post page:** "•••" for Report/Delete; comments in a dark panel with avatars and thread
      lines; reply bar with a round gold send button.
- [ ] **New post:** × top-left, gold Post top-right; your photo and a "People near you" chip.
- [ ] **New post (D80):** a **Text & photos / Voice** switch at the top. Text & photos: type, then
      the dashed gold **Add a photo** button right under the text. Voice: record first, caption
      optional. Record a clip, switch to Text & photos: a note says the clip won't be posted.
- [ ] **Empty feed** (Home or a place with no posts): only the "Start a post" button, no round +.
      After the first post appears, the round + shows bottom-right and the big button is gone.
- [ ] **Keyboard (Android and iPhone):** on a post, tap the comment box and type a few lines: the
      box sits right on top of the keyboard and you can see everything you type. Same for the
      new-post screen, sign-in, register and the Account forms.
- [ ] Open a place, then one of its posts: a "Posted in [place]" strip stays under the header
      while you scroll the comments; tapping it goes back to the place.
- [ ] **Account:** one page: profile card (color band, photo with camera badge, Edit bio /
      Color / View), About, Medals, then dark grouped settings. Email shows a Confirmed / Not
      confirmed badge; radius is a three-way switch.
- [ ] **Account sub-pages** (username, email, password, blocked, reports, suggestions, standing,
      delete, policies) each start with an icon and a big title. Reports and suggestions are
      cards with colored status badges.

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
- [ ] **Automatic suspension (D74):** hard to do by hand (10 accounts at least 3 days old); the
      automated tests cover it. If one happens: it's at the top of Reports, the account's case
      lists every report on its posts; **Ban** removes the posts, **Lift** brings them back.
- [ ] A case with more than 20 reports shows a per-reason summary and **Show all**.
- [ ] Audit log lists everything you did. **Sign out** ends the session.
