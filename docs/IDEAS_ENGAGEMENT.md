# Community Engagement Ideas (parked, 2026-10-22)

**Status:** ideas from the app's owner, written up for review by other advisors (product, marketing,
legal) before anything is scheduled. Nothing here is built or approved. `docs/SPEC.md` is unchanged.

## Context: what Jax is today

Jax is a location-verified, pseudonymous social app for Jacksonville, FL (Duval County):

- **Local by design.** The area feed shows posts within about 530 yards of you. Each place (business, park, venue) has its
  own discussion that opens only near it. Posting or commenting needs a fresh location reading that the server checks.
- **Pseudonymous.** People see a username and photo, never email or exact location.
- **Already built that these ideas can reuse:**
  - posts with photos, voice and video, comments and votes;
  - friends and private messages;
  - moderation (reports, held content, warnings, suspensions), and an admin portal;
  - medals;
  - anonymous **area statistics** (counts per ZIP code, no individual tracking, groups under 10 hidden, D116).
- **Explicitly out of scope today** (spec §15/§19): events, meetups and RSVPs; ads and sponsored content;
  subscriptions; push notifications; recommendation algorithms. Some ideas below touch these lines and would
  need a scope decision.

The owner's goal: the app works as intended, but quiet areas can feel empty. These ideas aim to give everyone in
Jacksonville something to take part in, and to produce valuable anonymous insight.

---

## 1. Weekly polls

**Idea:** a multiple-choice question each week on topics that matter locally (city politics, prices and inflation
in your area, etc.). Results posted at the end of the week for everyone; the owner keeps the data.

**Why it's strong:** a **location-verified Jacksonville poll** is rare. Most online polls can't show the people
answering actually live here. That's a real selling point for the insight business, and it makes users feel heard.

**Suggested shape:**

- Admin portal: write the question and choices, set open and close times, publish.
- Voting:
  - one vote per account, from inside Duval;
  - stored like the area statistics: a keyed code instead of the account ID, so each person votes once, but the
    key is destroyed when the poll closes, leaving only totals;
  - each answer tagged with the voter's **ZIP code**, so results can show differences across the city (with the
    10-person minimum).
- Results visible to all when the poll closes (not before, to avoid a bandwagon effect), kept in an archive.

**Concerns:**

- **It's not a scientific sample.** Results describe _Jax users_, not all residents. Label them that way,
  especially if they're sold or quoted.
- **Political opinions are sensitive data.** Answers should never be traceable to a person (the design above
  ensures that), and the Privacy Policy needs a line about polls.
- **Neutral wording matters.** Leading questions damage trust. Consider a short question-writing checklist.
- **Attempts to rig the vote:** limit votes to accounts a few days old and in Duval, as the place votes already do.

**Questions for the owner:**

1. Show results only when the poll closes, or right after someone votes?
2. Break results down by ZIP code (more valuable, needs enough voters)?
3. Can guests vote? (Recommendation: no, accounts only.)
4. Who writes the questions: only the owner, or suggestions from users?

---

## 2. Citywide discussion topics

**Idea:** a Jacksonville-wide area with topics anyone in the city can join, such as elections, events (conventions,
RAM, etc.) and best Jaguars gear on game days, so people in quiet areas always have something to read and join.

**Suggested shape:**

- A "Jacksonville" tab or section with **topics created by the admin**, not by users, so it stays focused and
  moderatable.
- Anyone **inside Duval** can post and comment, which keeps it local without the 530-yard radius.
- Topics can be pinned, scheduled (game days) and closed automatically (after an event or election).
- It reuses the existing post, comment, vote, report and moderation features.

**Concerns:**

- **Moderation load goes up.** A citywide audience, and especially politics, brings heated threads. The existing
  tools apply, but someone has to review reports faster. Consider slower posting limits in political topics.
- **It changes the product.** Jax's identity is "what's happening right around you." A citywide area should stay
  clearly separate so the local feed keeps its character.
- **Scope:** discussing events is fine. **Event listings, RSVPs and meetups** are out of scope in the spec.

**Questions for the owner:**

1. A separate tab, or a section inside Home?
2. Can people suggest topics for approval?
3. Do political topics get stricter rules (for example a civility reminder, or no new accounts)?

---

## 3. Contests (memes, drawing prompts)

**Idea:** contests like "best Jacksonville meme," or a picture of a public figure holding something invisible where
users draw what they're holding. Winners chosen by votes and featured in a post.

**Suggested shape:** a special citywide topic (idea 2) with a deadline. Entries are image posts, there's one vote
per account (the same anti-rigging rules as polls), and the winner is announced automatically when it closes. An
in-app drawing tool is a large build; uploads of images made in any app are much simpler to start with.

**Concerns:**

- **Images of real people:**
  - Photos are copyrighted by their photographer, so use public-domain or properly licensed images (some official
    government photos are public domain; check each).
  - Edited images of public figures can go too far (sexual, violent or defamatory content). These need active
    moderation, and the Community Guidelines already cover them.
- **Prizes change the legal picture.** A contest decided by votes (skill or judging) is generally fine, but prizes
  need official rules. **Florida regulates game promotions**: chance-based promotions with prizes over $5,000 need
  registration and a bond. Have a lawyer review the rules before offering prizes.
- **Vote rigging:** friends voting for each other is normal. Mass fake accounts are what to prevent, using the
  same rules as polls.

**Questions for the owner:**

1. Prizes, or bragging rights (a medal, a featured post)? Medals avoid most of the legal work.
2. Who picks the prompts?

---

## 4. Local news ticker

**Idea:** a scrolling strip with the latest headlines from Jacksonville news outlets.

**Suggested shape:**

- The server reads the outlets' public **RSS feeds** every 15 minutes, which is free.
- The app shows **headline, outlet and time**, and tapping opens the article in the browser. No article text or
  images unless an outlet allows it.

**Concerns:**

- **Each outlet's terms of use.** RSS is meant for this kind of display, but check each one, and stick to
  headline + link + credit.
- **Balance.** Include several outlets so the app isn't seen as favoring one.
- **A moving ticker can be distracting and hard to read** for some people. A tappable, swipeable strip or a short
  list is friendlier, and must respect the phone's "reduce motion" setting (the app already does elsewhere).

**Questions for the owner:**

1. Which outlets? Candidates: News4JAX (WJXT), First Coast News (WTLV/WJXX), Action News Jax (WJAX/WFOX),
   The Florida Times-Union, Jacksonville Today, Jacksonville Business Journal.
2. Where should it sit: top of Home, or its own small section?

---

## 5. Game-day celebration

**Idea:** a fun animation when the Jaguars win.

**Suggested shape:**

- **The admin presses "We won!"** in the portal, which shows a short celebration (confetti in team-like colors and
  a message) the next time people open the app that day.
- Automatic score checking is possible, but free score feeds are unofficial and can break, so the manual button is
  more reliable.

**Concerns:**

- **Trademarks.** "Jaguars," the logo and team artwork belong to the team and the NFL. An app can say "Jacksonville
  won!", but must not use the logo or official artwork without a license. Keep the artwork original. This fits the
  planned original app mascot (tracker, Future ideas).
- Respect "reduce motion," and keep it to a few seconds.

**Questions for the owner:**

1. Manual button or automatic?
2. Celebrate other local teams too (Jumbo Shrimp, Icemen, UNF/JU)?

---

## 6. A public reputation score (like Reddit's karma, under another name)

**Idea:** each person earns a score from the up and down votes on their posts and comments. It's **public to all
users**, so people think before posting. It should not strain the system, and it shouldn't be called "karma."

**Name ideas:**

- **Rep** (short for reputation);
- **Props**;
- **Cred**.

"Standing" is already taken by the private _Account standing_ screen (warnings and suspensions), so avoid it.
**Rep** reads clearly next to a name ("1.2k rep").

**Cost:** low. Every post and comment already stores its vote total, updated in the same database step as the vote,
and the load test showed those paths are fast. Options:

- **Live total:** one counter per person, updated with each vote. One extra tiny write per vote.
- **Nightly total:** summed by the existing daily job. No extra work per vote, but it updates once a day.

Either way, showing it costs nothing extra: it's one number read with the profile.

**Suggested shape:**

- **Score:** upvotes minus downvotes received on posts and comments.
- **Shown** on the profile, and optionally as a small badge next to the username on posts.
- **Votes that count:** only from accounts a few days old (the same rule place votes use).
- **Votes that don't count:** your own, and votes on removed content. Removal for breaking the rules can also take
  some rep away.
- **A cap on how much one person can move another's rep each day**, so a friend or an enemy can't swing it alone.

**Concerns:**

- **Scope.** The spec lists _advanced reputation systems_ as out of scope, so building this needs a scope decision
  and a Decision Log entry.
- **Popularity isn't the same as good behavior.** A civil but unpopular opinion gets downvoted. If low rep ever
  limits what someone can do, that punishes disagreement, not rule-breaking. Recommendation: display only at first.
  Keep enforcement tied to reports and moderation, which already exist.
- **Gaming.** Vote rings and fake accounts. Mitigated by the account-age rule, location-verified accounts and the
  daily cap.
- **New users** start at 0 and can look untrustworthy next to veterans. Consider showing rep only after a first few
  posts, or as tiers (e.g. "New," "Regular," "Trusted") instead of a raw number.

**Questions for the owner:**

1. Shown next to names on every post, or only on profiles?
2. Display only, or should rep ever unlock or limit things?
3. A raw number, or tiers?
4. Counted from posts and comments, or posts only?

**Owner's answers (2026-10-22):**

1. **Profile only**, not next to names on posts. (Showing it on posts would also be cheap, one number read
   alongside the author, so this is a design choice that can be revisited.)
2. **Open: for the advisors to weigh in.** Should Rep stay display-only, or ever unlock or limit things (for
   example posting limits for very low Rep, or trust perks for high Rep)? See the concern above: popularity isn't
   the same as good behavior.
3. **Raw number vs tiers:** undecided, to be seen.
4. **Posts only** for now. (Including comments would cost about the same, one counter update per vote, so it can be
   added later without a redesign.)

---

## 7. Year in Duval (potential build, owner 2026-11-11)

**Idea:** each December, a private recap for each person: neighborhoods they posted in, medals earned, their
top-voted post, places they rated, polls they answered.

**Suggested shape:**

- Built only from the person's own records (posts, ratings, medals, poll votes). **Not** from the anonymous area
  statistics (D116), which by design can't be tied back to a person.
- Shown only to that person, inside the app. No share button (owner: sharing outside the app works against
  anonymity).
- A few swipeable cards, generated once by a December job and kept until the end of January.

**Questions for the owner:** which numbers to show; whether masked or deleted posts count; the first run date
(December after launch).

---

## 8. Events and event rooms (draft for discussion, owner 2026-11-11)

**Idea:** people at the same event can talk to each other while it's happening. Example: at PorchFest, people
didn't know which porch each band was playing on. An event room answers "where is X playing?" from people who are
actually there.

**Why it matters:** the owner sees the lack of event coverage as the app's main weakness. Events also solve the
cold-start problem: they put many people in one spot at one time, so a room feels alive even before the app is
widely used.

**Suggested shape:**

- **An event** = name, start and end time, an area (one or more pins with a radius, so PorchFest can have a pin per
  porch), and an optional organizer.
- **The room** opens only for people inside the event area during the event window (same location rules as place
  discussions). It has:
  - text chat, reusing area chat (D218);
  - a pinned info card: a map of the stages or porches, and the schedule;
  - quick taps such as "Starting now," "Long line," "Sold out," "Lost & found."
- **After the event:** the room closes and is purged on the area-chat timetable.
- **Organizer posts:** verified organizers post official updates with a label, like "The Owner" (D157), through
  the business website.
- **Before the event:** listed in an "Upcoming in Duval" list with an "Interested" count only, and no public list
  of who is going.

**Where events come from** (the upkeep problem):

- **Admin-curated calendar.** Someone adds 10–20 local events a week in the admin portal. This is the only
  reliable way to cover grassroots events (PorchFest, Art Walk, Riverside Arts Market, neighborhood festivals),
  which aren't on ticket sites. Budget the hours, or give it to an ambassador.
- **Organizer submissions** through the business website (business accounts already exist). They're free at
  first; a "featured event" placement could be a paid option later.
- **User suggestions**, confirmed by people nearby, like place voting (D94).
- **Ticketing data** for big venues (arena, stadium, amphitheater, Florida Theatre). Ticketmaster has a free event
  search service. Eventbrite stopped offering public event search a few years ago. Check each service's current
  terms before use.

**Concerns:**

- **Crowd safety and panic posts.** A false "shots fired" post at a packed event can cause harm. Event rooms need
  slow mode, alarming phrases held for review, an admin on watch for big events, and a fixed "Emergency? Call 911"
  line. JaxSide must never present itself as a safety or emergency tool.
- **Weak phone signal at big crowds.** Chat polls every 3 seconds (D114), so failures must be quiet and retried.
  Keep event pages light.
- **GPS drift in crowds and downtown.** Event areas need a more generous radius than places.
- **Moderation spikes** concentrate on event nights.
- **Event names** are other people's brands. Say "at PorchFest" plainly, use no logos, and partner with organizers
  where possible.

**Questions for the owner:** who keeps the calendar; free organizer submissions at launch; whether events need a
scope decision (events and RSVPs are on the out-of-scope list; this design deliberately has no RSVP list).

---

## Owner's calls on other ideas (2026-11-11)

- **Sharing posts outside the app: ruled out.** It works against anonymity.
- **"My spots" on profiles:** use the existing favorites instead. *Privacy note:* a public list of someone's
  favorite places can reveal where they live or work, so make it opt-in or friends-only, and never show it with
  masked posts.
- **Home-screen widget:** liked; what it shows still needs working out.
- **Phone notifications:** the owner is still thinking. Note that "get an answer now" questions mostly go unseen
  without them.
- **Meetups: ruled out.** People are anonymous, and the owner doesn't want liability for strangers meeting.
- **Game mode for people to play together:** back burner.

---

## Overall suggestions

- **Suggested order** (most value first, least risk and work):
  1. **citywide topics**, which also hosts contests;
  2. **weekly polls**, for data and for making users feel heard;
  3. the **game-day celebration** (small and fun);
  4. the **news strip**;
  5. **contests with prizes** (most legal work).
  6. **rep** whenever the scope decision is made; it's cheap to build.
- **Polls and area statistics fit together:** poll results by ZIP code next to activity by ZIP code are a strong
  combined offering for the insight business, still totals-only.
- **Each feature adds moderation work.** Plan who reviews reports as the city-wide parts grow.
- **Before selling any insight:** a lawyer review of the Privacy Policy, the poll methodology wording ("Jax users,"
  not "residents") and the separate company set-up.
