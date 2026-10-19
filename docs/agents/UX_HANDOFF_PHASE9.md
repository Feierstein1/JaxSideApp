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
