# Store submission plan (Google Play and Apple)

Written 2026-11-22 from the stores' own pages read that day (Apple App Review Guidelines;
Google Play Help: User Generated Content, Sign-in details, Functionality, Account deletion,
Pre-review checks). Quotes are from those pages. **Neither store publishes the exact steps a
reviewer takes**, so this lists what their rules require, not a guaranteed script. Details on
each store form are in `STORE_PREP.md`.

## 1. What the stores expect (and don't)

- **They don't expect real users or real posts.** No rule asks for an active community. They
  check that the app works, follows the rules, and has no junk in it.
- **Junk they can see is a problem (Apple).** Apple 2.1: "placeholder text, empty websites, and
  other temporary content should be scrubbed before submission." So anything the review accounts
  can see must look like a real app, not "test test". Google's pages say nothing about test
  content but reject apps with "very little content" or that "do nothing".
- **They need full access from anywhere.** Apple: "provide either an active demo account or fully-
  featured demo mode" and "Enable backend services so that they're live". Google: sign-in details
  must be "valid regardless of user location"; a geo-gated app must give a login that works
  anywhere. **Done:** review mode (D268).
- **Don't call it a test, demo or beta.** Apple 2.2: "Demos, betas, and trial versions of your app
  don't belong on the App Store". What you call it to yourself doesn't matter; what reviewers read
  does (review notes, store text, and the app's own policies, see 3a).
- **Would they hire someone in Jacksonville?** Nothing in either store's pages says they do, and
  it isn't how app review normally works (reviewers use the demo account from wherever they are;
  Google also runs automated device checks that don't post). I can't rule it out. If it happened,
  that person would see whatever is public near them, like any local user, which is why public
  test content should be cleaned up **before the public launch**, not necessarily before review.

## 2. What reviewers check (from the rules)

| #   | Check                                                            | Rule                                                                                    | JaxSide today                                                 |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Sign in with the given login, from outside Florida               | Apple Before You Submit, 2.1; Google Sign-in details                                    | ✅ review mode; checked 2026-11-21                            |
| 2   | App doesn't crash, freeze or show errors                         | Apple 2.1; Google broken functionality, pre-review crash checks                         | Test on a phone before each build                             |
| 3   | Terms accepted before posting; they forbid objectionable content | Google UGC; Apple 1.2                                                                   | ✅ sign-up checkbox, zero-tolerance Terms                     |
| 4   | Filter objectionable content                                     | Apple 1.2                                                                               | ✅ text screening, held posts                                 |
| 5   | Report content and users (separate from block)                   | Apple 1.2; Google UGC                                                                   | ✅ posts, comments, photos, profiles, messages, ads           |
| 6   | Block users                                                      | Apple 1.2; Google UGC                                                                   | ✅                                                            |
| 7   | Act on reports in good time                                      | Apple 1.2 "timely responses"; Google UGC                                                | You: check the admin queue daily                              |
| 8   | Published contact info                                           | Apple 1.2; Google privacy contact                                                       | ✅ Contact us, support@jaxside.com                            |
| 9   | Delete account inside the app, plus a web page                   | Apple 5.1.1(v); Google account deletion                                                 | ✅ in app; jaxside.com/delete-account                         |
| 10  | Privacy policy linked in the store and in the app                | Apple 5.1.1(i); Google                                                                  | ✅ (store field: jaxside.com/app/privacy)                     |
| 11  | Location, camera, mic and photo prompts explain why              | Apple 5.1.1, 5.1.5                                                                      | ✅ app.json wording                                           |
| 12  | Ads can be reported                                              | Apple 2.5.18                                                                            | ✅ "Report this ad"                                           |
| 13  | **Ads: user can see why they were shown that ad, in the app**    | Apple 2.5.18                                                                            | ❌ **missing** (see 3b)                                       |
| 14  | **No "beta" wording**                                            | Apple 2.2                                                                               | ❌ **every policy page starts "JaxSide is in beta"** (see 3a) |
| 15  | Store answers match the app (data safety, ads, rating)           | Google; Apple 2.3                                                                       | ✅ answered 2026-11-19                                        |
| 16  | Restricting by location must not look arbitrary                  | Apple 3.2.2(v) lists "Arbitrarily restricting who may use the app, such as by location" | Explain in review notes: a local community for one county     |
| 17  | Sign in with Apple                                               | Apple 4.8: only if the app offers Google/Facebook-style login                           | ✅ not needed (username and password only)                    |

## 3. To do before submitting (in order)

- **3a. Remove "beta"** from the app's policy pages (`packages/shared/src/policies.ts`, the
  "Beta" section). Claude, small change.
- **3b. "Why this ad"** in the ad menu: the area it was aimed at (your ZIP / near the place /
  city-wide) and that it's from that business's plan. Claude, about half a day with tests.
- **3c. Decide on test posts (your call):**
  - **Option 1 (recommended): make review accounts see only review content.** Today the sandbox is
    one-way: real people can't see review posts, but reviewers can see real posts near Five
    Points, including your test posts. Making it two-way means reviewers only ever see the sample
    accounts' posts (plus business posts and ads), and **you keep all your test posts** for your
    own testing. Claude, small change with tests.
  - Option 2: delete or tidy your test posts near Five Points (within about half a mile).
- **3d. Seed enough sample content** for reviewers: done (rachel_rvsd, jaxfoodie904, dmoore_jax,
  7 posts, 2026-11-21). Optionally add photos and colors to those accounts.
- **3e. Deploy** the above, after a backup.
- **3f. Re-check both review accounts** (section 5).
- **3g. Review notes** (section 6) go into each store.

**Later, not before this review:** if JaxSide ever **charges businesses** for ads or boosts, Apple
3.1.3(g) says "buying advertisements to display in the same app (such as sales of 'boosts' for
posts in a social media app) must use in-app purchase". Paying on the website may still count.
Ask Apple before taking any payment. Nothing is charged today, so it doesn't affect this review.

**Possible questions from Apple (no change needed now):** 1.2 says "random or anonymous chat"
doesn't belong. Area chat is with named accounts and moderated, but a reviewer could ask.

## 4. Testing sheet (do this on a phone before each submission)

Sign in as `review_google` (Android) and later `review_apple` (iPhone):

1. Sign in works; Home shows the Five Points area.
2. Feed: sample posts show; open one; comment; vote.
3. Post with a photo; post with a voice clip; edit and delete your own post.
4. Places: map centered on Five Points; open a restaurant; read and post in its discussion.
5. Events: list and calendar open; open an event.
6. Report a post, a comment, a person and an ad; each confirms.
7. Block a sample account; its posts disappear; unblock.
8. Friends: request from the other review account, accept, send messages both ways.
9. Account: profile, settings, Terms, Privacy, Guidelines, Contact us open; delete account screen
   opens (**don't confirm**).
10. Sign out and back in.
11. With your own normal account: no review accounts' posts or profiles visible.
12. Nothing on any screen says test, demo, beta or placeholder.

## 5. Review accounts: how we handle them

| Account                               | Use                                       | Password            |
| ------------------------------------- | ----------------------------------------- | ------------------- |
| review_google                         | Given to Google                           | in the secrets file |
| review_apple                          | Given to Apple                            | in the secrets file |
| rachel_rvsd, jaxfoodie904, dmoore_jax | Sample people with posts; never given out | in the secrets file |

Secrets file: `deploy/staging/secrets/test-accounts.txt` (git-ignored; keep a copy in a password
manager). All five are made in the admin portal (no email) and flagged **review account**.

**Before every submission (first one and every app update):**

1. Admin portal → Users: all five exist, are Active, and show "review account".
2. The user page's card says **review mode is on**.
3. Sign in as the reviewer account once (or ask Claude to run the remote check).
4. Look through what review accounts can see; delete anything odd (reviewers may have posted
   during an earlier review).
5. If an account was deleted (reviewers sometimes test Delete account), recreate it in the admin
   portal with the **same username and password** and the review flag, so the store's notes still work.

**Never:** change their passwords without updating the store forms; give the sample accounts'
logins out; turn review mode off while a review is open.

## 6. Review notes (paste into both stores)

> JaxSide is a local community app for Jacksonville, Florida (Duval County). Normally the app
> only works inside the county: the server checks the phone's location before anyone can read
> or post locally. The account below is set up so that the server places you in Jacksonville
> (Five Points, Riverside) wherever your device is, so you can use every feature from anywhere.
> What review accounts post is only visible to other review accounts, never to the public, so
> please feel free to post, comment, vote, report, block and message. Sign in with the username
> and password below; no code is needed.

Google: Play Console → App content → Sign in details (done for review_google). Apple: App Store
Connect → App Review Information (when enrolled).
