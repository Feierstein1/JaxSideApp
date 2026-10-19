# Handoff to the UX/UI agent: Phase 9 screens to restyle

Phase 9 (friends, D76) was built before the D79 redesign and merged afterwards. Every feature
works and is tested; these screens and pieces still use plain or older styling. Please bring
them in line with the D79 design (DARK tokens, `ListGroup` / `ListRow`, `PageTitle`, skeletons,
haptics). Don't change behavior, API calls or what's shown (privacy rules in D76).

| Where                     | File                                                         | Notes                                                                                                                         |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Notification bell         | `apps/mobile/src/social/Bell.tsx`                            | In the header next to the username. Uses `BRAND.gold` and `COLORS.error` for the badge: switch to DARK tokens                 |
| Notifications screen      | `apps/mobile/app/(app)/notifications.tsx`                    | Opened from the bell (hidden tab). Old light styles (`styles.screen`); Accept/Decline inline                                  |
| Friends tab (feed)        | `apps/mobile/app/(app)/friends/index.tsx`                    | "@name posted near [area] / at [place]" rows; button to "Your friends and requests". Needs `PageTitle`, skeleton, empty state |
| Your friends and requests | `apps/mobile/app/(app)/friends/manage.tsx`                   | Add by username, requests in/out, friends list with Remove. Old `Field` / list styles                                         |
| Person row                | `apps/mobile/src/social/FriendRow.tsx`                       | Shared by the screens above; light borders (`COLORS.cardBorder`)                                                              |
| Profile friend button     | `apps/mobile/src/profile/ProfileScreen.tsx` (`FriendButton`) | Four states: Add friend / Request sent · Cancel / Accept + Decline / Friends. "Remove friend" is in the ··· menu              |
| Settings switch           | `apps/mobile/app/(app)/account/index.tsx` ("Friends" group)  | "Hide my recent posts from friends". Already a `ListRow`; check spacing                                                       |
| Place page                | `apps/mobile/app/(app)/places/[id].tsx` (`friendFans`)       | "Favorited by your friends …" line under `PlaceHero`; maybe fold into the hero                                                |
| Post page vote split      | `apps/mobile/src/discussion/VoteControl.tsx` (`split`)       | D83: "12 up · 3 down" beside the score on an opened post only                                                                 |
| Tab bar                   | `apps/mobile/app/(app)/_layout.tsx`                          | New **Friends** tab (people icon) between Places and Account; hidden for guests                                               |

When done: run the usual checks (typecheck, lint, prettier, app tests, Android export) and
update `docs/MANUAL_TESTS.md` §7c if anything visible changed.

## Done (2026-10-19)

All rows restyled to D79 without changing what's shown or which API calls are made:

- **Bell:** round raised button like the username pill; gold icon and a red count badge when
  something is new.
- **Notifications:** dark `Screen` + `PageTitle`; waiting requests grouped under "Friend
  requests" (Accept / Decline), the rest under "Earlier"; skeleton and empty state. It's a
  hidden tab, so it now gets the app header and its own back arrow (it had no header before).
- **Friends tab:** black strip with a "Your friends" button (gold "N new"); activity cards with
  the friend's color stripe, ringed photo and a place / area icon tile; skeletons, pull to
  refresh, empty state with **Find friends**.
- **Your friends:** `PageTitle`; add by username with a gold send button in the row; requests,
  sent requests and friends in `ListGroup`s; Remove moved into each friend's **•••** (still
  asks first).
- **FriendRow:** sits inside `ListGroup`s; photo ringed in the person's color.
- **Profile friend button:** gold Add friend / grey Request sent / gold-tinted Accept + Decline
  box / teal **Friends ▾**. "Remove friend" moved from the profile ••• menu to **Friends ▾**:
  with it, that menu had three actions plus Cancel, and Android dialogs only fit three buttons.
- **Settings switch:** label shortened to fit one line ("Hide my posts from friends"), with an
  On / Off line under it.
- **Place page:** "Favorited by your friends" is now inside `PlaceHero`, above the Save button.
- **Vote split:** teal ▲ count and gold ▼ count beside the pill.
- **Tab bar:** Friends uses the same filled / outline icon and active pill as the other tabs.
