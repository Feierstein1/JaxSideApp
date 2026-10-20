# Private messaging: design (Phase 10)

Status: **approved by the user 2026-10-20** ("I like all of your recommendations"; Q22, D95).
Mutual friends only for now; messaging anyone may come later (possibly with subscriptions,
once many people use the app).

## What it is

One-to-one chats between two friends, with text and photos. It reuses what the app already
has: friends (D76), blocking, reporting, text screening, photo uploads and the notification bell.

## Decisions

| #   | Question                         | Decision                                                                                                                                                                                                                         |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Who can message whom?            | **Mutual friends only.** Strangers can't message you.                                                                                                                                                                            |
| 2   | Must you be in Duval to message? | **Yes, when sending** (D16): only "inside the county" is checked. Messages are never tied to a location.                                                                                                                         |
| 3   | Groups?                          | **Not at first.** One-to-one only.                                                                                                                                                                                               |
| 4   | What can be sent?                | **Text (up to 1,000 characters) and photos/GIFs** (same checks and metadata stripping as posts). Voice messages later.                                                                                                           |
| 5   | Screening                        | **Same rules as posts, but nothing is held:** a message that matches a blocked phrase (threats, slurs) is refused with an explanation; links from brand-new accounts are refused. The other person never sees a refused message. |
| 6   | Reporting                        | **Report a message** from the chat. The report sends that message **plus the 10 messages around it** to the moderators; the Privacy Policy says so. Moderators can't open chats that nobody reported.                           |
| 7   | Encryption                       | **Encrypted on our server (like emails, D35), not end-to-end**, so reports can be checked. The Privacy Policy states this plainly.                                                                                               |
| 8   | Blocking and unfriending         | Blocking ends the chat for both and stops new messages. Unfriending stops new messages; the old chat stays readable until you delete it.                                                                                        |
| 9   | Deleting                         | **Delete for me** any time. **Unsend** your own message within 15 minutes (gone for both). Deleting your account deletes every message you sent.                                                                                |
| 10  | Keeping messages                 | Kept until deleted as above. Reported messages are kept with the report for 1 year.                                                                                                                                              |
| 11  | Read receipts and "typing…"      | **Off.**                                                                                                                                                                                                                         |
| 12  | Live updates                     | **Checked every 3 seconds while a chat is open**; the bell/messages badge updates within 30 s otherwise. WebSockets and phone push later.                                                                                       |
| 13  | Limits                           | 30 messages a minute, 10 new chats a day, 1,000 messages a day. New accounts (under 3 days) can only reply, not start chats.                                                                                                     |
| 14  | Where it lives in the app        | A **Messages** chat-bubble icon in the top bar next to the bell (with its own unread count), and **Message** on a friend's profile and in the friends list.                                                                      |

## How it's built

- Tables: `Conversation` (exactly two people, one row per pair), `Message` (sender, text
  encrypted, photo IDs, unsent flag), `ConversationMember` (last-read time, hidden-for-me
  time). Indexed by conversation and time so a chat loads one page at a time.
- Every message endpoint follows the usual order: sign-in → strict input check → rate limit →
  in-Duval check (sending) → membership check (you must be one of the two people, never
  trusted from the app).
- Tests: strangers can't message; blocked people can't; you can't read a chat you're not in;
  unsend window; report includes context; refused messages never reach the other person.
