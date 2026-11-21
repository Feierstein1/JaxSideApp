# App Store and Google Play preparation (P7.10)

Everything the two stores ask for, filled in from what the app actually does. Answers marked
**(you)** need your input or account. Nothing is submitted without your go-ahead.

## Accounts and builds

| Item                        | Apple App Store                                                                        | Google Play                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Developer account **(you)** | Apple Developer Program, $99/year, **organization** as JaxSide LLC (D-U-N-S 150085122) | Play Console, $25 once, **organization** as JaxSide LLC (same D-U-N-S; no 12-tester rule for organizations) |
| App name                    | "JaxSide" (D118); a subtitle like "Jacksonville local" helps search                    | Same                                                                                                        |
| Bundle / package ID         | `com.jaxside.app` (set; can't change later)                                            | Same ID                                                                                                     |
| Availability                | **United States only** (stores can't limit by city; the server enforces Duval)         | Same                                                                                                        |
| Builds                      | Expo EAS Build → TestFlight                                                            | Expo EAS Build → internal / closed testing track                                                            |
| API address                 | The production server's HTTPS address in `EXPO_PUBLIC_API_URL`                         | Same                                                                                                        |

## Age rating: 17+ / Mature (the app is 18+ by policy)

- **Apple:** answer "Unrestricted web access: No"; "User-generated content: Yes" (forces the
  UGC rules below); mature themes "Infrequent/Mild" (users may swear). Expect **17+**, the
  highest Apple rating, and keep the 18+ sign-up screen.
- **Google (IARC questionnaire):** social features with user interaction and shared location
  (approximate) → expect **Mature 17+**. Target audience: 18 and over only.

## User-generated content rules (Apple guideline 1.2, Google UGC policy)

Both stores require these for any app where people post. **All are built:**

| Requirement                                                                     | Where it is                                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Terms the user must agree to, with **zero tolerance** for objectionable content | Sign-up checkbox + Terms ("Zero tolerance for objectionable content")                                               |
| A way to **filter** objectionable content                                       | Text screening (P5.4), spam checks (P5.5), held-for-review                                                          |
| A way to **report** content and users                                           | Report on posts, comments, photos, profiles (P5.1, P6.5)                                                            |
| A way to **block** abusive users                                                | Block on profiles; Settings → Blocked users (P5.2)                                                                  |
| The developer **acts on reports within 24 h** **(you)**                         | Admin portal queue. You commit to checking it daily                                                                 |
| Published contact info **(you)**                                                | **support@jaxside.com** (2026-11-08): store listings, Terms and Privacy Policy; in the app via Account → Contact us |

## Account deletion (both stores require in-app deletion)

Built: Account → Settings → **Delete account** (P4.12). For Google you also need a **web page
or link** explaining how to delete an account; use `/legal/retention` plus a short page with the
same steps **(add before submitting)**.

## Privacy: Apple "nutrition label" and Google "Data safety" form

Answers based on the code. Nothing is used for tracking and nothing is sold. **Ads (D240) are
JaxSide's own**, picked on the server from the current location (not saved), favorited places and
Interested / Not interested choices (kept 30 days): declare that app activity as used for
"Developer's advertising or marketing" (Apple) / "Advertising or marketing" (Google), linked to
the person, **not** tracking, not shared with advertisers (they get totals only).

| Data type                                                    | Collected?                                   | Linked to the person? | Why                                                 | Notes                                                                              |
| ------------------------------------------------------------ | -------------------------------------------- | --------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Email address                                                | Yes                                          | Yes                   | Account management, security                        | Stored encrypted (D35); never shown to others                                      |
| Precise location                                             | Yes                                          | Yes                   | App functionality (local content), fraud prevention | Only while using the app; exact readings deleted after 30 days; posts store ~100 m |
| Coarse location                                              | Yes                                          | Yes                   | App functionality                                   | Post location (rounded)                                                            |
| Photos                                                       | Yes (optional)                               | Yes                   | App functionality (posts, profile photo)            | Metadata removed before storing                                                    |
| Videos                                                       | Yes (optional)                               | Yes                   | App functionality (video posts)                     | Recorded or picked by the person; cleaned like photos                              |
| Audio (voice recordings)                                     | Yes (optional)                               | Yes                   | App functionality (voice posts)                     | Only when the person records a voice post                                          |
| App interactions (ad Interested / Not interested, favorites) | Yes                                          | Yes                   | App functionality, developer's advertising          | Choices kept 30 days; advertisers get totals only                                  |
| Other user content (posts, comments, bio)                    | Yes                                          | Yes                   | App functionality                                   |                                                                                    |
| User ID                                                      | Yes                                          | Yes                   | App functionality, security                         |                                                                                    |
| Device ID                                                    | Yes                                          | Yes                   | Fraud prevention (ban evasion)                      | A random installation ID made by the server, not a hardware ID                     |
| Birth year                                                   | **No** (checked at sign-up, not stored, D36) |                       |                                                     |                                                                                    |
| Contacts, health, financial, browsing, purchases, crash data | No                                           |                       |                                                     | Add crash data if you add error tracking later                                     |

- **Encrypted in transit:** yes (HTTPS). **Can users request deletion:** yes, in the app.
- **Tracking (Apple ATT):** none, so no tracking prompt.
- Privacy Policy URL: `https://jaxside.com/app/privacy` (same text as the app; also
  `https://api.jaxside.com/legal/privacy`). Account deletion URL: `https://jaxside.com/delete-account`.
- **Google "Ads" declaration: Yes, the app contains ads.** Google counts the app's own ads (direct
  and house ads), not just ad networks. The store shows "Contains ads".

## Permission wording (already in `app.json`)

- **Location (when in use only):** "JaxSide uses your location while you use the app to confirm
  you are in Jacksonville and show what is nearby. Your exact location is never shown to other
  people." No background location (blocked in config).
- **Photo library:** "JaxSide lets you add photos from your library to posts and your profile.
  Photos are cleaned of location and camera details before they're shared."
- **Camera:** "JaxSide uses the camera only when you record a video for a post."
- **Microphone:** "JaxSide uses the microphone only when you record a voice post or a video for a
  post." All are asked for only when the person uses that feature.

## Google Play agreements (read 2026-11-17)

Developer Distribution Agreement and Play Console Terms of Service, as they apply to JaxSide:

- **Who signs:** the account holder must be 18+ and able to bind JaxSide LLC (Kenny, owner / AMBR).
  The account owner is Kenny's personal Gmail; add kenny@jaxside.com as an admin user.
- **Privacy (DDA 4.8):** a legally adequate privacy notice, data used only for what users
  allowed, kept securely and only as long as needed: covered by the Privacy Policy and Data
  Retention policy. Keep them in step with the app (`packages/shared/src/policies.ts`).
- **Permissions (4.2):** disclose them accurately (above, and in the Data safety form).
- **Contact info (4.7):** keep the public email, phone and address valid and current.
- **Free stays free (3.7):** the app launches free and must stay free; anything paid would be a
  separate version or in-app purchase.
- **Payments:** business plans are bought on jaxside.com for advertising, not as digital goods
  inside the phone app, and the app sells nothing. Check Google's **Payments policy** before the
  app ever sells something to app users (that would need Google Play billing).
- **Product policies (4.1):** the Developer Program Policies apply: user-generated content
  (moderation, report, block: built), User Data and Data safety, account deletion, location
  permissions (when in use only), ads (no ads disguised as content: ads are labeled Sponsored),
  target audience 18+.
- **Google can remove the app or end the account (8.3, 10.3)** for policy breaks or loss of good
  standing; it may also end the account on a change of control of the LLC (16.7).
- **Legal terms to know:** JaxSide indemnifies Google for claims from its app (14.1); California
  law and Santa Clara County courts (16.8). Not legal advice; a lawyer read is worth it before
  any paid features.

## Store listing **(you)**

- Short description, full description, keywords (e.g. Jacksonville, Duval, neighborhood, local).
  **First line of the description and one screenshot say "Jacksonville (Duval County) only"**,
  so people elsewhere don't download it and leave bad reviews.
- Screenshots: iPhone 6.7" and 6.5", Android phone; a feature graphic for Play (1024×500).
- App icon 1024×1024 (Jaguars-colors palette only, no NFL marks; D33).
- Category: Social Networking.
- Support URL and email; marketing URL optional.
- **Location note for reviewers:** the app only works inside Duval County. Give App Review a
  demo account **and** explain that location checks will refuse them outside Jacksonville.
  Options: a review-only account flagged to skip the boundary (needs a small server feature), or
  a screen recording. Apple reviewers are usually outside Florida, so plan for this.

## Submission day (Google first, Apple once enrolled)

**2026-11-21: steps 1-4 are done.** Review mode is live (deployed with `b838dbf`). The owner made
`review_google` and `review_apple` with the admin portal's new-user form (username and password
only, no email) and flagged both. Checked from outside Florida: both sign in with the saved
passwords, the server places them at Five Points, and their account shows `reviewAccount`. Next:
step 5 (build, upload, submit to Google).

Ready as of 2026-11-19; the owner plans Google for the week of 2026-11-23. Passwords for both
review accounts are in the git-ignored `deploy/staging/secrets/test-accounts.txt` (also keep them
in a password manager). Review mode (D268) is built.

1. **Deploy** the latest commit to the server (back up the database first; check no other
   session is mid-deploy). Review mode needs to be live before anyone reviews.
2. **Create both review accounts** in the admin portal (D273): Users → **Add user**, tick
   "This person is 18 or older…" and **Store review account**:
   - `review_google`, email `review-google@jaxside.com`
   - `review_apple`, email `review-apple@jaxside.com`
     Use the passwords from the secrets file. The Zoho aliases already exist (2026-11-19). The
     accounts are confirmed at once. (Signing up in the app from inside Duval, then "Make review
     account" on the user page, still works too.)
3. **Check the flag:** open each account's page; the "Store review account" card should say
   review mode is **on**.
4. **Check it works:** sign in as `review_google` on a phone with mock / far-away location, or
   ask Claude to run the check; the feed should be Five Points, and a test post should not show
   to a normal account.
5. **Google Play:** Sign in details are already filled in (username `review_google`, password,
   the note about Jacksonville). Build the Android app bundle (`eas build --platform android
--profile production`), upload it (Testing → Internal testing first, then Production when
   ready), and send for review.
6. **Apple (after enrollment is approved and the $99 paid):** in App Store Connect → the app →
   App Review Information: username `review_apple`, its password, and the same note about
   Jacksonville. Build with `eas build --platform ios --profile production` and submit.

## Before submitting (checklist)

Company and accounts (details in `docs/LLC_PROCESS.md`):

- [x] JaxSide LLC filed (L26000560458), EIN, D-U-N-S 150085122 (2026-11-13)
- [x] Business email: `kenny@jaxside.com`, `support@jaxside.com` (2026-11-08)
- [ ] **jaxside.com live with real content** (production server, D243). Apple rejects
      placeholder or minimal sites; the D-U-N-S request is done, so this is the next blocker
- [x] Apple Account on `kenny@jaxside.com` (2026-11-18, made with Apple Support's help after
      sign-up kept failing; the old Yahoo account is abandoned)
- [ ] Apple Developer Program, organization ($99/year, **you**): **submitted 2026-11-19,
      enrollment ID UJ7U66A486**, waiting for Apple to verify signing authority (may phone the
      904 cell); then pay
- [x] Google Play Console, organization ($25 once): account `JaxSide LLC`, ID
      5262362696067233378, owner kenfeier@gmail.com; identity, website (Search Console TXT on
      jaxside.com), trader status and both phones verified (2026-11-19). Public phone is a Google
      Voice number; public email support@jaxside.com. Next: Create app

App and server:

- [ ] Production server live with HTTPS (D243), production API address
      (`https://api.jaxside.com`) in the store builds
- [ ] Support email (done: support@jaxside.com, 2026-11-08) + account-deletion help page on the
      website (`https://jaxside.com/delete-account`, requested 2026-11-16 with the app policies
      on jaxside.com and separate business terms)
- [ ] SES production access (email to real people; the sandbox only sends to verified addresses)
- [ ] NCMEC CyberTipline registration (R4)
- [x] **Review mode built** (`docs/PRODUCTION_SWITCHOVER.md`, D268, 2026-11-19): review
      accounts use a fixed **Riverside / Five Points** location (owner's pick), are ready to use,
      skip the new-account waits, and the outside-Duval message offers a review sign-in; admin
      switch on the user page. What they write is seen only by review accounts; the phone shows
      them at Five Points. **Not on the server yet:** deploy (backup first) before submitting
- [ ] **Before submitting:** Zoho aliases `review-google@jaxside.com` and
      `review-apple@jaxside.com`; account `review_google` created with the password already in
      Play Console "Sign in details" (saved in git-ignored `deploy/staging/secrets/test-accounts.txt`)
      and flagged as a review account; same for Apple later
- [ ] On a phone outside Duval, the app shows a clear "JaxSide is for Jacksonville (Duval
      County)" message, not something that looks like an error
- [ ] Store availability set to United States only; listing says Jacksonville-only up front
- [ ] Final read of Terms, Privacy Policy and Guidelines (D52)

Owner verification (not blocking the stores; owners can use "Ask JaxSide" meanwhile):

- [ ] Google Business Profile manager access on an established listing (Q40), then the
      Business Profile API access request (B6.1)
- [ ] Google's review of the sign-in screen (needs the privacy policy and terms on jaxside.com),
      so the public can use Sign in with Google
