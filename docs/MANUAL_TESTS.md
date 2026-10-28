# Manual test checklist (phone + admin portal)

> **2026-10-23:** the user ran the phone checklist and reported everything working (uploads, display, location rules); the phone items are marked passed. The admin portal section (§10) is still to do (Phase 15, P15.8).

The server behavior behind every item here is already covered by automated tests and by
`npm run e2e:live -w @jax/server`, which plays temporary people through the whole app over
real HTTP and then deletes them (98 checks; see `docs/TESTING.md`). This list is what a
person needs to check on a real phone: screens, wording, GPS, permissions, and how it feels.

**Before you start:** dev server and Expo running (`npm run dev`, `npm run dev:mobile`), Docker
services up, phone on the same Wi-Fi. Emails (codes) arrive in Mailpit at
http://localhost:8025. Use a second account (or a second phone/emulator) for the two-person
checks. Tick each box when it looks right; note anything odd next to it.

## 1. First launch and location

- [x] The app asks for location **once**, with an explanation first.
- [x] Choosing "Only this time": it asks again next launch (expected).
- [x] Denying location shows the explanation screen with **Open Settings**; Account and sign out
      still work.
- [x] Allowing location goes straight to the Home feed.
- [x] **Near [neighborhood] (D72):** the top of Home and of Places shows a gold pin and "Near …" with a
      sensible name for where you are (it's approximate near borders). Note any wrong or missing
      names; we can pin them.

## 2. Sign up, confirm, sign in

- [x] Create an account: under 18 is refused with a clear message; the Terms / Privacy /
      Guidelines links open.
- [x] Sign in before confirming: Home shows the "Confirm your email" banner; posting asks you to
      confirm first.
- [x] Enter the 6-digit code from Mailpit in Account → Settings: the banner disappears.
- [x] Wrong password shows an error; the **Show** button reveals what you typed.
- [x] Forgot password: the code from Mailpit resets it; the old password stops working.

## 3. Guest mode (view-only)

- [x] Sign out → **Continue as guest**: the top bar says **GUEST**.
- [x] The Places tab is hidden.
- [x] You can scroll the area feed and open posts to read comments.
- [x] There's no comment box (a "Sign up to comment" button instead), no Report links, and
      tapping a vote arrow or **+** explains you need an account.
- [x] Account shows the guest explanation; **Sign up or sign in** returns to sign-in.

## 4. Home feed and posting

- [x] New / Top this week switch works; scrolling loads more; pull down refreshes.
- [x] **Refresh (D73):** the round-arrow button top-right on Home (and right of the Places search box)
      reloads with a new location.
- [x] **Walking (D77):** with the app open on Home, walk a block (60+ yd): within about 30 s the
      feed reloads on its own and the "Near …" label updates.
- [x] **No connection (D77):** turn on airplane mode and tap refresh: the old posts disappear and
      "Could not reach the server" shows with **Try again**.
- [x] **Reopen (D73):** switch to another app, walk a block (60+ yd), come back: Home and Places
      reload on their own. Come back without moving: nothing reloads.
- [x] **Search (D74):** type in the search box on Home: post text or `@username` finds nearby
      posts only; no match shows "No posts nearby match…".
- [x] Tapping refresh more than 30 times in a minute shows "Slow down a little".
- [x] With no posts nearby, the "No posts in this area yet" message and button show.
- [x] **+** opens New post; posting returns to the feed with your post at the top.
- [x] Posting again within 10 seconds shows "You're doing that too often. Try again in…".
- [x] Posting the exact same text again is refused ("You already posted this").
- [x] Open your post: **Delete my post** works (after confirming).
- [ ] The top bar shows the JaxSide mark on the left and only messages and notifications on the
      right (no username, D119); guests also see the GUEST pill.
      While hidden, the ★ on your own posts is hidden too (D73).
- [x] **Post look (D69):** each post has a header in the author's color (rounded top) with their
      photo, a larger username, a ★ on your own posts, and the time on the right ("5 min ago" up to
      3 days, then the date). Below: white post with black text, a colored 3 px border, and the
      votes/comments row under a colored line. Header text is white on dark colors, black on light.
- [x] Change your color (section 9) and your username: your existing posts show the new ones.

## 4b. Photos

- [x] New post → the dashed **photo** box asks for photo access once, then opens your library.
- [x] Add up to 4 photos (thumbnails with an ✕ to remove); post: the first shows large in the feed,
      the rest as small squares.
- [x] A **GIF** uploads and plays animated in the post (D74).
- [x] An iPhone HEIC photo uploads fine (it's converted to JPEG).
- [x] **Away from Wi-Fi (D73):** with `npm run dev:remote`, on cellular, a full-size camera photo
      uploads in a few seconds (it's shrunk on the phone first).
- [x] Account → Profile → tap the circle (or **Add a photo**): pick and crop a square photo; it
      shows on your profile and to others who open your profile.
- [x] On someone else's post, long-press a photo → the report sheet opens (type: photo).
- [ ] In the portal, the photo report shows the image; **Remove** makes it disappear in the app.

## 4c. Voice posts and type tabs (D75)

- [x] New post → **Record a voice post**: the app asks for the microphone once; the timer counts
      up; tap to stop (or it stops at 1:00). The clip appears with play and a trash can.
- [x] Post it with no text: it shows in the feed with a black play bar; play, pause and the time
      work, and starting one clip pauses any other.
- [x] Add a photo, switch to **Voice**, record, tap **Post**: a warning says the photo won't be
      included, with **Go back** / **Post without photo** (D87). Same the other way round.
- [x] On an iPhone (if you have one), clips play too.
- [x] Home and place pages show **All / Text / Media / Voice** under the black bar; each tab only
      shows that kind of post ("No voice posts nearby yet" when empty).
- [ ] Report a voice post; in the portal its case page has an audio player.

## 4d. Video posts (D102)

- [x] New post → **Video** → **Choose a video** (or **Record (30 s)**: asks for the camera once).
      A video longer than 30 s is refused (on iPhone you can trim it first).
- [x] The preview plays; post with or without a caption. In the feed it shows a play tile with
      the length; tapping it plays with the phone's controls.
- [x] The **Video** tab shows only video posts. A post can't mix photos, voice and video (the
      warning says which part would be left out).
- [x] An iPhone video plays on an Android phone (if it doesn't, tell me: it may be the iPhone's
      "High Efficiency" format).

## 5. Comments, votes, reports (two accounts)

- [x] Account B comments on A's post; A replies to B; replies are indented one level (D105).
- [x] B taps **Reply** on A's reply: the box starts with "@A ", and the new reply lines up with
      A's reply under the same comment (never deeper). "@A" shows in gold and opens A's profile.
      A gets no notification for it.
- [x] A post with 100 comments (replies included) shows "Comments are closed…" and no reply box;
      **Reply** buttons are gone (D105).

- [x] Up/down votes change color and score; tapping your vote again clears it.
- [x] On an opened post, "N up · N down" shows beside the score and updates when you vote (D83).
- [x] Delete your own comment: it shows "[deleted]" if it had replies.
- [x] B reports A's post (**Report post**) and a comment (**Report**): the sheet shows reasons,
      details, and the "call 911" note for Child safety; then "Thanks for reporting".
- [x] B's Account → Settings → **My reports** lists them as "Waiting for review".
- [ ] **Auto-hide (D73):** three different accounts report the same post: it disappears from the
      feed right away. In the portal it shows **Held** with all three reporters and the author;
      **Approve (publish)** brings it back.

## 6. Screening and spam

- [x] Comment "I know where you live": you see **Sent for review**, and the other account
      doesn't see the comment.
- [x] A post with 3 web links is sent for review.
- [ ] (After adding a WARN rule in the database or, later, the portal) a matching post asks
      **Post anyway?**, and choosing it posts.

## 7. Places and business rooms

- [x] The Places list only shows places **within a mile**, on a dark grey background, each as
      its own card with a 2 px black border: a header in the **category's color** with a white
      category pill and the name (long names shrink), then distance (left) and post count (right).
      No "You're here" text, no map.
- [x] The **filter** button sits left of the search box in the black bar; it opens sort and
      category options. Search finds a place by name.
- [x] Each type has its own color (food red, coffee brown, bars purple, outdoors green, shopping
      magenta, things to do orange, services blue, hotels teal, other slate).
- [x] Opening a place shows the same card (category color, pill, name, distance, posts) on a dark
      background. The **star** next to the name is white when not a favorite and gold when it
      is; tapping it shows "Added to favorites" / "Removed from favorites" briefly.
- [x] Within 0.3 mi, the round gold **+** bottom-right writes a post there (no "Write a post here"
      link). Home uses the same round + button.
- [x] Star a place; it appears under Account → Settings → Favorite places.
- [x] Each place row shows its post count, and a ★ with how many people favorited it (D74).
      Filter → **Most favorited** puts the most-starred places first.
- [x] Within about 0.3 mi of a place, its discussion opens and you can post; farther away you see
      the "get closer" message.
- [x] No place names longer than 30 characters appear.

## 7a. Places map (D99)

- [x] (D113) Places show as their category icons in their colors. Tap one: a small card shows
      its name, posts and favorites. Tap the card or the place again: the place opens. Tap
      elsewhere on the map: the card closes.
- [x] (D113) Open the map, leave, and open it again (even with weak signal): the streets appear
      right away (kept on the phone for a week).

- [x] Places → the **map** button next to the filter: a dark map of Jacksonville with your spot in
      gold and nearby places as dots in their category colors. Pinch and drag work; it doesn't
      go far outside Duval.
- [x] Zoom in: place names appear under the dots; street names show on the map.
- [x] Tap a dot: that place opens. Back returns to the map.
- [x] The **list** button switches back. The "© OpenStreetMap contributors" credit is visible.

## 7j. Colors, limits and paging (D110–D112)

- [x] Buttons, links and the active tab are teal (no gold except medals).
- [x] Home and a place's discussion show 30 posts, then a **Load more posts** button.
- [x] A profile shows 10 posts, then **Load more posts** for 10 more.
- [x] With 30 friends, sending or accepting another request says the limit is 30.

## 7h. Your own posts, anywhere (D105)

- [x] (D115) Account → **View** opens your profile inside the Account tab. Back returns to Account.
- [x] (D115) Each of your posts shows where it was made (neighborhood or place name) and has a ••• menu
      with Edit and Delete. Open one, then Back: you're on your profile again (not Places or Home).
- [x] (D115) Open one of your area posts from over 528 yd away: comments show, but instead of the
      comment box it says "Get within 528 yd of this post to comment".

- [x] Account → **View profile**: the profile lists **Your posts**, area and place posts both,
      and the Posts number matches the list. Tapping a place post opens it.
- [x] Away from a post (across town, or outside Jacksonville): your own post still opens, with
      "Comments show when you're near this post" and no reply box. ••• → **Edit post** saves new
      text; **Delete post** works.
- [x] Near the post, its comments show again.
- [x] Someone else's post away from it still says you need to be nearby.

## 7i. Places of worship (D105)

- [x] Places filter has **Places of worship**; churches, mosques and synagogues show with the
      heart icon in dark ochre.

## 7f. Business owners (D103)

- [x] On a place page, **I own this place** opens the owner screen. A place with a website offers
      **Business email**; places with a phone offer **Phone call**; every place offers **Code on
      your website or social page**.
- [x] Business email: a Gmail address is refused; an address at the place's website gets a code
      (Mailpit); entering it shows "You're a verified owner".
- [x] Your posts in that place's discussion show a gold **Owner** tag; your area posts don't.
- [ ] Website code: you get a `JAX-…` code; after sending a link it says the team will check.
      In the portal → **Owners**, the claim shows the code and link; **Verify owner** or **Reject**.
- [ ] Phone: the portal shows the number on file and a code; entering that code in the app
      verifies. **Remove Owner tag** in the portal takes the tag away.

## 7b. Suggest a place

- [x] Places → the round gold **+** bottom-right (Add new place) opens the form, which says your
      current location is used as the pin. Names over 30 characters are refused.
- [x] Typing the name of a place that's already listed nearby shows **Already listed nearby?**;
      tapping one opens that place.
- [x] Pick a category, send: "Thanks for the suggestion". It's **not** in the Places list yet.
- [x] Account → Settings → **My suggestions** shows it as "Waiting for review".
- [ ] In the portal (section 10), **Places** shows it with a small map. Approve it: it appears in
      the app's Places list, and My suggestions says "Approved". Reject another with a reason:
      My suggestions shows the reason.

## 7c. Friends and notifications (D76, two accounts)

- [x] A opens B's profile → gold **Add friend** under the profile card: it turns into a grey
      "Request sent · tap to cancel".
- [x] Within about 30 s B's **bell** (round button left of the username, top-right) turns gold
      with a red number. Opening it shows a dark **Notifications** page with a back arrow; the
      request is under "Friend requests" with **Accept** / **Decline**, and the number clears.
- [x] B accepts: both profiles show a teal **Friends ▾** button; A's bell lists "Accepted your
      friend request" under "Earlier". Tapping **Friends ▾** offers **Remove friend** (asks first).
- [x] On Android, a friend's profile **•••** shows Block (or Unblock) and Report profile, nothing
      cut off.
- [x] **Friends** tab (bottom bar, filled gold when active): a "Your friends" button at the top
      (gold "N new" when requests are waiting). After B posts in the area, A sees a dark card with
      B's color stripe: "**B** posted near **[area]**" and a teal pin; after a place post, "posted
      at **[place]**" with a gold storefront. The post text is never shown there. Empty: "No friend
      activity yet" with **Find friends**.
- [x] B turns on Account → Friends → **Hide my posts from friends** (the line under it says "On:
      friends don't see where you post"): B's posts leave A's Friends tab.
- [x] Friends tab → **Your friends**: type a username and tap the gold button beside it (a teal
      "Request sent" note appears); cancel a sent request; remove a friend from their **•••**.
- [x] B favorites a place: on A's view of that place, a gold-tinted "Favorited by your friend
      **B**" line shows inside the place card, above **Save to favorites**.
- [x] Open a post (not in a feed): next to the vote pill, a teal ▲ count and a gold ▼ count (D83).
- [x] Blocking a friend removes the friendship. Guests don't see the Friends tab or the bell.

- [x] **Friends tab switch (D89):** **Friend activity** / **Your friends**; the search box finds a
      friend's recent activity by username; activity only covers the last 3 days.
- [x] Open a place from Friend activity, then tap the **Places** tab: the Places list shows (not
      that place). The place's back arrow also goes to the list.
- [x] Places filter has **Gyms & fitness** (indigo, barbell icon).

## 7d. Verify changes: community place voting (D94)

- [x] Run `npm run demo:data -w @jax/server -- --changes` (demo suggestions near your area posts).
- [x] Near that spot, Places shows **Verify changes near you** at the top: a "New place?" card
      (Corner Taco Window, 3/10) and a "Closed?" card. Swipe sideways if there are more.
- [x] Tap **It's here**: the card says "You voted…"; you can't vote again on it.
- [x] Far away (more than 528 yd) the strip doesn't show; voting from too far is refused.
- [x] On a place page within range, **Closed or doesn't exist?** asks first, then the place
      appears in the strip for others.
- [x] Suggest a place: the message says people nearby will vote it in; My suggestions says
      "Waiting for votes nearby".
- [ ] Portal → **Places** shows each suggestion's votes; **Removals** lists requests with every
      vote (who, which way, how far) and **Restore place** / **Remove now**.

## 7e. Private messages (D98, two accounts that are friends)

- [x] (D114) Leave a chat open without touching it for over 2 minutes: a new message from the
      friend can take up to 30 s to appear. Type, scroll or send: new messages show within ~3 s again.

- [x] The top bar has a chat-bubble **Messages** button next to the bell.
- [x] On a friend's profile, **Message** opens a chat; so does the chat icon in Friends → Your
      friends. A non-friend's profile has no Message button.
- [x] Send text and a photo: the other phone shows a red number on Messages within about 30 s;
      with the chat open, new messages appear within a few seconds.
- [x] Long-press your message within 15 minutes → **Unsend (for both)**: it disappears on both
      phones. **Delete for me** hides it only for you.
- [ ] Long-press their message → **Report**: in the portal the case shows the message with the
      messages around it; **Remove** unsends it.
- [x] Messages → long-press a chat → **Delete for me**: it's gone from your list until they send
      something new.
- [x] Unfriend or block: you can't send any more (old messages stay readable until deleted).

## 7g. First-time guides (D104)

- [x] First area post: tapping **+** shows "Posting to your area" (Do / Don't / Good to know, dots,
      Next / Back). Closing it with × returns to the feed; the next **+** shows it again. **Got it,
      let's post** opens the composer, and it doesn't show again.
- [x] The first place post, comment, photo, voice recording, video, place suggestion, "closed?"
      vote, report, bio / photo / username change, friend request, block and message each show
      their own guide once; closing cancels just that action.
- [x] Sign in to the same account on another phone (or reinstall): guides already finished don't
      show again. A guest sees "Welcome, guest" once.
- [x] Account → Help → **Community rules** lists every guide; tapping one shows it with **Done**.
      The composer's **Posting rules** link opens the matching guide.
- [x] TalkBack / VoiceOver reads "Page 1 of 3: Do"; with reduce motion on, the guide appears
      without sliding.

## 7k. Area statistics (D116)

- [x] Account shows "Include me in area statistics" (on), with an explanation. Turning it off and on saves.
- [x] Privacy Policy has the "Area statistics" section.

## 8. Profiles and blocking

- [x] Tap a username on a post or comment: profile shows bio, join date, post count, recent posts.
- [x] **Block**: their posts and comments disappear for you, and they can't open your profile.
- [x] Account → Settings → **Blocked users** lists them; **Unblock** brings everything back.

### Pop-ups (D97)

- [x] Tap refresh many times fast: "Slow down a little" appears as a dark rounded card with a gold
      hourglass and a gold **OK**, not a white system box. Tapping outside closes it.
- [x] Delete one of your posts: a red trash icon, grey **Cancel** on the left and a red **Delete**.
      The Android back button acts as Cancel.
- [x] A post's **•••**: a dark sheet slides up from the bottom with icons (flag for Report, trash for
      Delete) and a separate **Cancel**. On a friend's profile, every option shows (Android too).
- [x] As a guest, try to vote: "Create a free account" with a gold person icon.

### Medals (D95, D122)

- [ ] On an account with medals: next to the name on its posts, small badges in each medal's
      shape (coin, rosette, hexagon, shield, diamond, star, arch) in its level's metal: bronze,
      silver, gold or platinum (icy blue-white). Smaller beside comment names.
- [ ] Its profile (and Account → Medals): each medal drawn in full with ribbons in its metal, its
      name with a level chip (Silver…), what it's for, "Silver since [date]" (or "Earned [date]"),
      and "Next: Gold at 100 posts" (or "Top level reached"). With no medals: a faded coin and
      "No medals yet…".
- [ ] Upvote someone's comment to +3 on 5 different posts: their Helpful Commenter medal appears
      right away (no waiting for the nightly check).

### Polls (D123)

- [ ] Home (D126): between search and the type tabs, a **Poll of the week** bar (question and a
      Vote button) while there's a poll you haven't answered; not while searching. Tap it: the
      question, the choices, **Vote**. Pick one → "Vote “…”? Your vote is final" →
      Vote. The screen then says "You voted “…”" and no totals.
- [ ] Vote again from another phone with the same account: refused ("You already voted").
- [ ] After voting, back on Home the same space shows **Citywide** instead (D126). As a guest,
      or with an account under 3 days old, Home shows Citywide right away.
- [ ] Admin portal → **Polls**: write a poll (question, 2–6 choices, opens / closes). Before it
      opens: Edit and Delete work, and the app doesn't show it. Once open: only "End now"; the
      card shows "N votes so far" but no totals.
- [ ] End it (or wait until it closes): open it from **See all → Polls**; the poll shows bars per
      choice, "By area" for ZIP codes with 10+ voters, and the note that
      results are JaxSide users, not a scientific survey. **Past polls** lists it.
- [ ] **Types (D124):** the dev seed has one of each. Yes / No: two big buttons (and "Not sure").
      Pick several: checkboxes, "Pick up to 2", a third can't be ticked. Rating: five buttons 1–5
      with "Very poor" / "Excellent" under the ends. Each poll shows its topic above the question.
- [ ] After closing: a rating shows "Average 3.8 out of 5"; Pick several says the percentages can
      add up to more than 100%. **Past polls** has topic chips that filter the list.
- [ ] Admin portal: the form changes with the type (answers, "up to", the words for 1 and 5),
      and the list filters by topic.
- [ ] Privacy Policy has a **Polls** section.

### Citywide topics (D125)

- [ ] Home shows **Citywide** in the shared space (once you've answered the poll): a short row of
      topics, newest first, scrolls sideways; **See all** beside it opens every topic with search
      and sorting (Newest / Most active / Most posts), **Suggest a topic** and **Polls**.
- [ ] Open a topic: its title and description, Latest / Top, and **Post in this topic**. The
      post form says the topic's name and "Everyone in Jacksonville can see this".
- [ ] A topic post shows **no distance**, and it does **not** appear in the local feed. On your
      profile it shows "Citywide: [topic]".
- [ ] From another part of town (still in Duval) you can comment on and vote for a topic post.
- [ ] **Suggest a topic**: send one; it shows under "Your suggestions" as "Waiting for review".
      Admin portal → **Topics**: approve it (change the title if you like) and it appears under
      Citywide; or reject it with a reason, which shows under your suggestion.
- [ ] Admin: create, pin, schedule an end, **Close** (the app shows "This topic is closed",
      no post button) and **Reopen**.

### Art deco look (D127, branch `ui/art-deco`)

- [ ] Home and Places: the black block ends in the icon's stepped edge; inner screens (Account,
      a post, a place) have the same steps under the header.
- [ ] Posts have their top corners clipped; the profile color stripe starts below the cut.
- [ ] Buttons, the Latest / Top switch, chips, the type tabs and the vote / comment pills have
      pointed (arrow) ends; the active type tab sits in a teal arrow.
- [ ] Section titles (e.g. on a profile, Account) are spaced capitals between ◆ diamonds.
- [ ] Nothing is cut off: long button labels, large text size, small phone.
- [ ] Home (D128): the poll / Citywide space is first, right under JAXSIDE, then your area,
      search and the type tabs, evenly spaced. The refresh button sits right of a smaller
      Latest / Top this week switch. A place's Discussion title has a small refresh button.
- [ ] Home (D129): a centered ◆ NEAR YOU ◆ above Latest / Top. Places list: search on the left,
      filters and the map switch on the right, no refresh button; walk 50+ m with the app open
      and the list reloads by itself.
- [ ] D130: the bottom bar has five tabs: Home, Places, **Citywide** (middle), Friends, Account,
      none cut off. Citywide lists every topic (search, sort, Suggest, Polls); open a topic, post
      in it, open a post, back out; tapping the Citywide tab returns to the list.
- [ ] D130: vote in the poll from Home: you're taken back to Home, the poll is gone and
      "Thanks for voting!" shows for a few seconds, then the Citywide topics.
- [ ] D131: the Citywide tab shows Suggest a topic and Polls at the top (labels on one line),
      then ◆ NEWEST TOPICS ◆ with three topics, then View all topics. All topics: search and
      category chips filter the list. Suggesting a topic asks for a category; the admin portal
      shows it and can change it when approving.

### City Topics (D133, branch `feature/city-topics`)

- [ ] The tab is called **Topics**. City Topics: on black, **City / Near me** (City first) and
      **Polls**; then the stepped edge; on grey, **View all city topics**, ◆ NEWEST TOPICS ◆ with
      three cards, and the + button. Near me shows "Near [area] · within 880 yd".
- [ ] Cards show the category, title, date started, posts and following count, and a
      **Follow** button that switches to **Following** (count goes up).
- [ ] **+** the first time shows the "Starting a topic" guide (dos, don'ts, and that Near me
      topics are only for people within half a mile). Then: City / Near me, title, category,
      description → Start topic → it opens.
- [ ] A Near me topic: visible and postable within half a mile; from across town it isn't
      listed and a direct link says you need to be within 880 yd.
- [ ] **View all**: title City Topics or Local Topics; search, the filter button (category,
      Topics I follow), Newest / Oldest; 20 at a time with Load more topics.
- [ ] A topic: Follow · count, and ••• → Report this topic (not on your own). Reported topics
      show in the admin Reports queue as "Topic"; Remove hides it, Approve brings it back.
- [ ] **Polls** (from City Topics): search, topic filters (the highlight sits on the label),
      grey list; a poll you haven't voted in says "Vote to see the results"; after voting you
      see live results and how many voted; Back returns to City Topics. **+** → Suggest a poll;
      the admin portal Polls page lists it under Suggested questions (Use / Decline).
- [ ] Home: the poll shows until you vote, then "Thanks for voting!" for a few seconds, then
      nothing (no City Topics row).

### Topic rules and screening (D134, P15.9–P15.10)

- [ ] Start a topic: the **Show my username as the creator** switch is off by default. With it
      on, others see "by @you" on the card and the topic; with it off, no name.
- [ ] Your own topics have a ★ (only you see it). View all → filter → **I started** lists only
      yours.
- [ ] Your topic's ••• has **Show / Hide my name as the creator** and **Delete this topic**
      (no Report, no edit). Delete asks first, then the topic is gone for everyone. The admin
      Topics page lists it under "Deleted by their creators" for a week.
- [ ] Someone else's topic's ••• has only Report. 15 reports from different people hide it;
      the admin sees it under "Held for review" and in the Reports queue.
- [ ] A topic or post with a slur (even spelled "k1ke" or "k i k e") is refused; a borderline
      term (e.g. "coon hound") is held for review; ordinary swearing posts fine.
- [ ] Admin **Screening** page: test a sentence, add a term, change its action, turn it off.

### SDK 58 (D136, D137, P15.11)

- [ ] Expo Go on SDK 58 opens the app; Home, Places, Topics, Friends and Account all work.
- [ ] The top-bar **Messages** button opens Messages and the **bell** opens Notifications
      (from every tab, not sent to Home); back returns to where you were. A friend's
      **Message** button opens the chat.
- [ ] New post: **Text & photos** is a larger option on its own line (picked by default),
      **Voice** and **Video** side by side under it; only one is highlighted at a time and
      every label fits.
- [ ] Places map still loads and its pins open.

### Home, ADMIN badge, spam and topic limits (D140–D143)

- [ ] Home: no Latest / Top switch; ◆ NEAR YOU ◆ is centered with the refresh button at the far
      right of the same line; posts start a little higher.
- [ ] A post from the last 24 hours has a small NEW tag in its top-right corner; older posts don't.
- [ ] Admin portal → Users → an account → **Show ADMIN badge**: their posts, comments and profile
      show a gold ADMIN tag under the name. **Remove** takes it away. They get no portal access.
- [ ] A post or topic like "crypto giveaway, send btc" says "Sent for review" and appears in the
      admin queue, not in the app; an ordinary post goes up as usual.
- [ ] Start a City topic, then try another: refused with the date you can start the next one. A
      Near me topic still works once. Deleting your topic doesn't free the slot.

### Place ratings (D144)

- [ ] At a place (within 0.3 mi), its page shows **Rate this place**: tap 👍 Liked it or 👎 Not for
      me; it highlights; tapping it again takes it back; switching changes it (still one vote).
- [ ] Away from the place the buttons are greyed with "You can rate it while you're here."
- [ ] After 10 people rate a place, the Places list shows a teal 👍 88% badge on its card, and
      Sort → **Most liked** puts it first.
- [ ] Admin portal → **Ratings**: the place is listed with its votes; Lock voting greys the
      buttons ("Rating is paused"); Clear votes resets it; each asks for a reason.

### Photos and the map (D145)

- [ ] Tap a photo on a post (in the feed or opened): it opens full screen; swipe through every
      photo; "2 / 3" and the dots follow; × and Back close it. Long-press still offers Report.
- [ ] A post with 2+ photos shows "3 photos · tap to view" above them, inside the card.
- [ ] Places → map: pan and zoom away, tap **Re-center**: back to you and the places around you.
- [ ] With the map open, close the app, go somewhere else (more than ~200 m), reopen: the map
      shows the new area without switching to the list and back.

### Admin: any place (D146)

- [ ] Admin portal → **All places** → search a place → **Remove** (give a reason): it's gone from
      the app's list and map; Removals → Removed lists it; **Keep** brings it back.
- [ ] **Add a place** with a pin copied from Google Maps (long-press the spot): it's in the app's
      Places list right away. A pin outside Duval is refused.

### Sign-up, topics, campuses, polls (D147–D150)

- [ ] Create account: there's no "I am 18 or older" switch; the birth year is still asked; the note
      mentions the email code. A too-recent birth year is refused.
- [ ] A new account (under 5 days old) tapping + on City Topics is told when it can start one, but
      can post inside existing topics.
- [ ] Places: a **Campuses** filter (plum, graduation cap) lists UNF, JU, FSCJ and the like; they
      show on the map. Suggesting "Lee High School" or "UNF Campus" is refused.
- [ ] Polls: **Open polls / Voted** at the top; answer one in Open and it moves to Voted with live
      results; closed polls are under Voted.
- [ ] Admin portal → Polls → **Make Poll of the week**: Home shows that poll; it's starred at the top
      of the Polls list; featuring another replaces it.

## 9. Account settings

- [x] Profile card: the band across the top is your color; the **Color** button opens 24 colors,
      and picking one changes the band (and your post stripes) right away.
- [x] **About** and **Medals** have black title bars with white text, joined to white boxes with
      black text; **Edit bio** sits under the bio box on the left; add/edit a bio (300 max).
- [x] Home: a black bar under the header holds New / Top this week; posts sit on dark grey.
- [x] Opening a post (area or place) shows the post and its comments on the same dark grey; the
      "Comments" heading is white and Delete/Report links are gold.
- [x] Change username: works once; a second change soon after is refused with the date.
- [x] Change email: code goes to the new address (Mailpit); the old address gets a notice.
- [x] Change password: other signed-in devices are signed out; this one stays signed in.
- [x] **Radius** (Settings) offers 176 yd, 352 yd and 528 yd; picking a smaller one shrinks the feed and the Places list. Distances on posts and places show in yards (feet when very close).
- [x] Policies (Terms, Privacy, Guidelines, Data Retention) open and read well.
- [x] Location → **Open phone settings** opens the app's settings.
- [x] **Account standing** says "good standing" with the How it works text.
- [x] Delete account (password + type DELETE) signs you out; that account can't sign in again.

- [ ] **Contact us (D90):** Account → Help → **Contact us**: pick Support ticket or General, add a
      subject and message, send → "Thanks!". In the portal, **Messages** lists it; **Show reply
      email** appears only if you turned on "You can reply to my account email"; **Mark resolved**
      moves it to Resolved.

## 9b. Accessibility (P7.6)

- [x] Phone settings → largest font size: screens still readable, nothing cut off or overlapping.
- [x] Turn on **TalkBack** (Android) or **VoiceOver** (iPhone): buttons read sensible names
      ("Write a new post", "Upvote", "More options", "Notifications"), and you can post and
      comment without looking.
- [x] Phone setting **Remove animations** (Android) / **Reduce Motion** (iPhone) on: buttons,
      votes, sheets and toasts no longer move or bounce; loading placeholders hold still (D78).
- [x] Text on the dark screens is white, grey, gold or light teal and easy to read.

## 9c. Look and feel (D78, D79)

- [x] **Every screen is dark**: feeds, Places, a place, a post, profiles, Account and all its
      sub-pages, sign-in, register, reset password, the filter / report / color sheets and the
      policy pages. No white page anywhere (the only light things are the toast and photos).
- [ ] **Header:** the small icon + **JAXSIDE** (JAX teal, SIDE white) sits top-left on every
      screen (after the back arrow on inner screens); no "PLACES" or "ACCOUNT" titles. Only
      messages and notifications on the right (D119, D120).
- [x] Text is in the new typeface (rounded, geometric). Headings and names are heavy.
- [ ] **Sign in (D121):** a navy header with sunburst rays, the icon (white edge), JAXSIDE and
      "Your neighborhood, live…", ending in a stepped edge; the form below on a dark card. Fields
      have icons; the field you're typing in gets a teal outline. Fits on a small phone with
      the keyboard open (scrolls).
- [ ] **Loading screen (D121):** open the app while signed in: the icon's frame draws itself,
      the skyline appears, JAXSIDE fills in from the left, then the building's fins light up one
      by one while it loads. With "Remove animations" / "Reduce Motion" on, the icon and name
      show still.
- [x] **Home:** under the header, "Near [neighborhood] · within 528 yd" (tap: opens Account),
      search pill + refresh, then All / Text / Media / Voice. Latest / Top this week scrolls
      away with the posts.
- [x] **Posts:** dark cards with a thick stripe in the author's color down the left; photo
      ringed in that color; name, ★ on yours, medals; "5 min ago · 120 yd"; vote pill (teal
      when up, gold when down) and comment pill; "Voice" / "Photo" tag on the right; "Popular"
      at 10+ points. A navy or black account color still shows a visible stripe.
- [x] **Places list:** each place is a dark card with a thick category-colored stripe, a colored
      icon tile, the name large, "Coffee · 120 yd", posts (teal) and ★ count, and "You can post"
      when you're close enough. Your favorites show a gold ★ next to the name.
- [x] **Place page:** big tile and name, address, three tiles (Away / Posts / Favorites), a
      "Save to favorites" button (turns gold when saved, toast at the bottom). Too far away: a
      dashed lock card with your distance.
- [x] **Post page:** "•••" for Report/Delete; comments in a dark panel with avatars and thread
      lines; reply bar with a round gold send button.
- [x] **New post:** × top-left, gold Post top-right; your photo and a "People near you" chip.
- [x] **New post (D80):** a **Text & photos / Voice** switch at the top. Text & photos: type, then
      the dashed gold **Add a photo** button right under the text. Voice: record first, caption
      optional. Record a clip, switch to Text & photos: a note says the clip won't be posted.
- [x] **Empty feed** (Home or a place with no posts): only the "Start a post" button, no round +.
      After the first post appears, the round + shows bottom-right and the big button is gone.
- [x] **Keyboard (Android and iPhone):** on a post, tap the comment box and type a few lines: the
      box sits right on top of the keyboard and you can see everything you type. Same for the
      new-post screen, sign-in, register and the Account forms.
- [x] Open a place, then one of its posts: a "Posted in [place]" strip stays under the header
      while you scroll the comments; tapping it goes back to the place.
- [x] **Account:** one page: profile card (color band, photo with camera badge, Edit bio /
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
