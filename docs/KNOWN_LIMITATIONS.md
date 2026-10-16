# Known limitations and next steps (P7.9)

What isn't done, what's deliberately simple, and the honest limits of the design. As of
2026-10-16.

## Needs you before launch

| Item                                                | Why it matters                                  | Reference                 |
| --------------------------------------------------- | ----------------------------------------------- | ------------------------- |
| Approve hosting and create the AWS setup            | Nothing is public yet                           | Q15, `LAUNCH_SERVICES.md` |
| Apple and Google developer accounts; store listings | Required to publish                             | `STORE_PREP.md`           |
| A plan for App Review outside Jacksonville          | Reviewers will be refused by the location check | `STORE_PREP.md`           |
| Support email + account-deletion help page          | Store requirements                              | `STORE_PREP.md`           |
| NCMEC CyberTipline registration                     | Legal duty once aware of child-abuse material   | R4                        |
| Starter slur list for screening                     | Only threat phrases are seeded                  | Q14                       |
| Try the app on your phone with the checklist        | The automated checks can't see screens or GPS   | `MANUAL_TESTS.md`         |
| Phase 3 gate: one vote and one comment on the phone | Last open on-device check from Phase 3          | P3.11                     |

## Deliberately deferred

| Item                                                                                                                 | Decision     |
| -------------------------------------------------------------------------------------------------------------------- | ------------ |
| Android map view (list works; free map later)                                                                        | Q13, D42     |
| Guest-to-account upgrade                                                                                             | D50          |
| Admin settings editor, screening-rule editor, reveal-email screen, per-user rate limits, location-flag review screen | D62          |
| Guests commenting or reporting (now view-only)                                                                       | D54          |
| App-integrity checks (Play Integrity / App Attest): interface only                                                   | P2.8         |
| Automated image classification: interface only                                                                       | P6.6, D65    |
| Fresher feeds ("New posts" button / auto-refresh)                                                                    | Future ideas |
| Automated phone UI tests (Maestro/Detox)                                                                             | D67          |

## Honest limits of the design

- **GPS can be faked** on a rooted or jailbroken phone. Freshness, accuracy, mock-location flags
  and impossible-travel checks make it harder, not impossible (R1). Integrity APIs would help.
- **Ban evasion** via a new email on a new phone is still possible; bans do carry to the phones
  an account used and to guest mode (R2, MS4).
- **Age** is a birth-year screen, not verification (R3).
- **One server, one database** is fine for a city beta; a big spike would need the grow-up path
  in `LAUNCH_SERVICES.md`. No caching layer yet.
- **Feed "Top"** is score within 7 days, without decay or personalization.
- **Coordinated spam** (same text from many accounts) relies on reports and moderators (D57).
- **Policies** are beta text written from the app's behavior, not reviewed by a lawyer (D52).
- **Mobile dependency advisories** inherited from Expo/React Native tooling remain until Expo
  updates them (R11).
- **The admin portal** is designed for one or two moderators on a desktop browser.

## Suggested next steps after launch

1. Watch the moderation queue daily (store requirement: act on reports within 24 hours).
2. Add error tracking (Sentry free tier) and uptime alerts.
3. Add the Android map (MapLibre with free tiles) and the "New posts" refresh.
4. Turn on Play Integrity / App Attest once the store accounts exist.
5. Revisit caching and the grow-up hosting path when usage grows.
