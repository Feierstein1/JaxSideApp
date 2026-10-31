# Business portal and ads: planning notes

Status: **planning only, nothing built** (D165). Written 2026-10-30 from the owner's outline
and answers. Open items are in the tracker (Q28–Q30). The build starts after the owner and I
settle the details.

## Goal

Verified business owners get their own website to run their place's presence on JaxSide:
read and answer their place's discussion from anywhere, manage staff, see simple numbers, and
later run paid ads. Users stay pseudonymous throughout.

## Decisions so far (owner, 2026-10-30)

- **Website, not the phone app.** Owners use a business site (for example
  `business.jaxside.com`) with its own login. The phone app stays for everyday users.
- **A separate business account.** Different from the owner's personal account, with its own
  email and password. The personal account has no access to it. This keeps the personal
  pseudonymous account unlinked and lets business contact details be kept under business terms.
- **One business account can run many places.** One place: it opens straight in. Several: a
  list to pick from, with a back button.
- **Claiming** starts in the phone app ("I own this place", from a personal account), then the
  owner is sent an email link to create the business account.
- **Verification** (free, and the claimant's own words are not trusted):
  - _Email:_ a code to an address at the business's own website domain.
  - _Phone:_ the owner (admin) looks up the business's public number independently, calls it,
    and the person who answers must give the code sent to the claimant's account.
  - No website and no phone on file: cannot be claimed in the app (the owner's decision).
- **Three roles:** Owner (master), Manager, Staff. Details to settle below.
- **Employees** are given a login by the owner: a username and a **temporary password** they
  must change at first sign-in. The owner can revoke or reset any employee at any time.
- **Posts still show "The Owner"** publicly; the owner can see which employee wrote each one.
- **Owners read and reply to their place's discussion from anywhere**, and can post any time.
- **Insights are counts only.** Owners never see who is in any number.
- **Ads** are targeted by location (radius around the place, or chosen ZIP codes), never by
  personal data. Owners see only totals.
- **"Interested / Not interested"** on an ad is a count per ad. No usernames.
- **Money:** a subscription is preferred over per-ad pricing, but only once there are enough
  users. First, free promos so friends' businesses can try it. Payment is built last.
- **Ads need approval** by the owner (JaxSide admin) before going live, at least while they
  are paid.

## Accounts and access

- A **business account** (email + password, optional two-factor) is a different table from
  personal users. A **place access** row ties an account to a place with a role.
- Roles: **Owner** (billing, ads, team, everything), **Manager** (posts, replies, drafts ads),
  **Staff** (posts and replies). The Owner can create, reset and revoke logins.
- Every post made through the portal records the real person (as for moderation today, D157);
  the public still sees "The Owner" with an optional staff name.
- A JaxSide admin can suspend any business login or take a place away from an account.
- Moderation still applies: posts are screened, strikes and bans apply to the business account.

## Discussion

Same board a user sees on the place page. Owners read and reply without being near the place
(a deliberate exception to the location rule; needs its own 🔒 test). A new post or comment
on the place shows in the portal inbox, with optional email notices (phone push is out of
scope).

## Insights (built on data that already exists)

The app already counts people by area without keeping anyone's history (D116):

- **Per ZIP:** distinct people per day, week and month; part of the day (morning, afternoon,
  evening, night); people there for the first time this month; "also visited" ZIP pairs.
- **Per place:** posts, comments, people who posted or commented, favorites and votes, by day.
- Groups under **10** are never shown. Guests and people who switched off area statistics are
  not counted. Places of worship are excluded.

What this means for the owner's screen: _people in the area_ (by ZIP and time of day) helps
decide where to run an ad; _place activity_ shows how the place's page is doing. Limits to
state plainly in the portal: counts are JaxSide users only, ZIP areas are bigger than a
storefront's radius, and numbers are small until the user base grows.

Sharing these counts with paying owners is "sharing area statistics with businesses", which the
Privacy Policy already allows (D117). **D116 and D152 say selling data needs a lawyer's review
first**, so decide whether counts are included in a paid plan (Q29) before charging for them.

## Ads

- Owners create an ad (image and text), preview it, turn it on or off, edit or delete it.
- Target: within a radius of the place, and/or chosen ZIP codes.
- Shown mixed into the area feed, and on the place's own page. Labeled **Sponsored**, with a
  report button, and a limit on how often one appears.
- Counted: views (an ad on screen), and Interested / Not interested, as daily totals per ad
  (not one row per view, to keep the database light).
- Review: a JaxSide admin approves ads before they go live (decision above), using the same
  screening and queue as other content.
- **Money, later:** free promo periods can be set by an admin per business at first, so no
  payments are needed to start. Subscription billing (Stripe, on the website) comes after there
  are users; it needs the LLC, a business bank account and the owner's approval of the cost.

### Ad rules added 2026-10-31

- **Draft → preview → live.** An owner builds an ad as a draft and previews it exactly as users
  will see it before anything goes live. Then they submit it; once approved it is scheduled and
  runs on its own. States: Draft, Waiting for approval, Scheduled, Live, Paused, Ended. Owners
  can pause, edit or delete (edits to a live ad go back for approval).
- **A time window per ad.** Each ad has its own start and end, so it shows only inside that
  window (and ends by itself).
- **A cap on live ads by plan.** Up to **3 different ads** can be live at once, depending on the
  plan.
- **Shown in every feed:** the area feed, place discussions and topic discussions, mixed in
  between posts. The server adds ads when it builds each list, so the phone can't pick or skip
  them.
- **Targeted by where the reader is right now.** Every feed request already carries the
  reader's location reading, so the server matches it to each ad's radius or ZIP areas. This
  is the reader's own location, not the page's: someone reading a place page from across town
  sees ads for where they are.
- **Rules that always hold:** labeled Sponsored, a report button, a limit on how many ads
  appear in one list, no personal data used, owners see only totals.

- Updates needed before ads go live: Terms for advertisers, Privacy Policy, and the store
  data-safety forms.

## Coming from today's setup

Owner claims and the owner team are on personal accounts (D103, D157). The in-app claim stays
as the first step. The team list moves to business accounts; "The Owner" masking stays.

## Suggested order

1. **Foundation:** business accounts, claim → invite link, place list, roles, temporary-password
   logins, discussion inbox and replies, audit of who posted.
2. **Insights:** the counts above.
3. **Ads:** drafts, preview, approval, targeting, stats, free promos. Payments last.
