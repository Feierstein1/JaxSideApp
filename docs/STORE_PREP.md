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

Answers based on the code. Nothing is used for tracking or ads, nothing is sold.

| Data type                                                    | Collected?                                   | Linked to the person? | Why                                                 | Notes                                                                              |
| ------------------------------------------------------------ | -------------------------------------------- | --------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Email address                                                | Yes                                          | Yes                   | Account management, security                        | Stored encrypted (D35); never shown to others                                      |
| Precise location                                             | Yes                                          | Yes                   | App functionality (local content), fraud prevention | Only while using the app; exact readings deleted after 30 days; posts store ~100 m |
| Coarse location                                              | Yes                                          | Yes                   | App functionality                                   | Post location (rounded)                                                            |
| Photos                                                       | Yes (optional)                               | Yes                   | App functionality (posts, profile photo)            | Metadata removed before storing                                                    |
| Other user content (posts, comments, bio)                    | Yes                                          | Yes                   | App functionality                                   |                                                                                    |
| User ID                                                      | Yes                                          | Yes                   | App functionality, security                         |                                                                                    |
| Device ID                                                    | Yes                                          | Yes                   | Fraud prevention (ban evasion)                      | A random installation ID made by the server, not a hardware ID                     |
| Birth year                                                   | **No** (checked at sign-up, not stored, D36) |                       |                                                     |                                                                                    |
| Contacts, health, financial, browsing, purchases, crash data | No                                           |                       |                                                     | Add crash data if you add error tracking later                                     |

- **Encrypted in transit:** yes (HTTPS). **Can users request deletion:** yes, in the app.
- **Tracking (Apple ATT):** none, so no tracking prompt.
- Privacy Policy URL: the server's `/legal/privacy` page (public once hosted).

## Permission wording (already in `app.json`)

- **Location (when in use only):** "Jax uses your location while you use the app to confirm you
  are in Jacksonville and show what is nearby. Your exact location is never shown to other
  people." No background location (blocked in config).
- **Photo library:** "Jax lets you add photos from your library to posts and your profile.
  Photos are cleaned of location and camera details before they're shared." Camera and
  microphone are not requested.

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

## Before submitting (checklist)

Company and accounts (details in `docs/LLC_PROCESS.md`):

- [x] JaxSide LLC filed (L26000560458), EIN, D-U-N-S 150085122 (2026-11-13)
- [x] Business email: `kenny@jaxside.com`, `support@jaxside.com` (2026-11-08)
- [ ] **jaxside.com live with real content** (production server, D243). Apple rejects
      placeholder or minimal sites; the D-U-N-S request is done, so this is the next blocker
- [ ] Apple Account email changed from the personal Yahoo address to `kenny@jaxside.com`
- [ ] Apple Developer Program, organization ($99/year, **you**); wait at least 2 business days
      after the D-U-N-S (from 2026-11-17); name, address and phone exactly as on Sunbiz and D&B
- [ ] Google Play Console, organization ($25 once, **you**)

App and server:

- [ ] Production server live with HTTPS (D243), production API address
      (`https://api.jaxside.com`) in the store builds
- [ ] Support email (done: support@jaxside.com, 2026-11-08) + account-deletion help page on the
      website
- [ ] SES production access (email to real people; the sandbox only sends to verified addresses)
- [ ] NCMEC CyberTipline registration (R4)
- [ ] Reviewer access plan for the location restriction (see above)
- [ ] On a phone outside Duval, the app shows a clear "JaxSide is for Jacksonville (Duval
      County)" message, not something that looks like an error
- [ ] Store availability set to United States only; listing says Jacksonville-only up front
- [ ] Final read of Terms, Privacy Policy and Guidelines (D52)

Owner verification (not blocking the stores; owners can use "Ask JaxSide" meanwhile):

- [ ] Google Business Profile manager access on an established listing (Q40), then the
      Business Profile API access request (B6.1)
- [ ] Google's review of the sign-in screen (needs the privacy policy and terms on jaxside.com),
      so the public can use Sign in with Google
