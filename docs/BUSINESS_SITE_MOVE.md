# The owner website moved out (D184)

"JaxSide for Business", the owner website, was built here as `apps/business` and moved
on 2026-11-02 to its own repo: **`C:\Users\kenfe\Projects\JaxSideBusiness`**. Its
`README.md` says how to run it; its `NEXT_AI.md` is the handoff for building on it.

It shares only the **database** with this app. What that means for work in this repo:

- **This repo owns the database.** Every table change and migration is made here
  (`apps/server/prisma`). After deploying one that the owner website reads or writes,
  copy `apps/server/prisma/schema.prisma` and `prisma/migrations/` to the website repo
  (its `NEXT_AI.md` says how to adjust the copy).
- **Shared rules are copied, not linked.** The website has its own copy of
  `packages/shared` (as `shared/`). When a rule it uses changes here (ad templates, ad
  schedule rules, word screening, password and form rules, colors), copy the change there.
- **This app still does these jobs for the website:**
  - writes `BusinessInvite` and emails the invite link (`BUSINESS_BASE_URL`, D172);
  - ends business access when an Owner tag is removed;
  - the admin portal's **Businesses** section (accounts, plans, free plans; D178, D179);
  - shows business posts and replies as "The Owner" (D174);
  - still to build here: **B3.3** ad approval queue, **B3.4** ads in the feeds and the
    view counters (`AdDailyStats`), **B3.6** the phone ad card, **B3.7** load check.
- **Settings here:** only `BUSINESS_BASE_URL` (where invite links point). On staging,
  while the website runs on the owner's PC with `npm run staging`, it is
  `http://localhost:3101`.
