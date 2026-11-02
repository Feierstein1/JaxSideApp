# Ad templates (proposal, D175)

Three fixed templates. Owners pick one, add a picture or GIF and a little text, and see a
preview exactly as it will look in the app. No custom layouts or code. The numbers are
first guesses to tune once you see real ads on a phone; they live in one place
(`AD_TEMPLATES` in `packages/shared/src/ads.ts`), so changing them is a one-line edit.

Every ad, whatever the template, always shows:

- a **Sponsored** label and the place's name (added by the app, not the owner);
- a **21+** line when the owner ticks "alcohol deal" (Q30);
- a report button, and **Interested / Not interested** (phone-app change, B3.6).

| Template | Where it shows | Picture | Smallest picture | Headline | More text | Picture size limit |
|---|---|---|---|---|---|---|
| **Banner** | A slim strip between two posts | Required, 1200 × 300 (4 : 1) | 800 × 200 | 40 characters | none | 1.5 MB (GIF 2 MB) |
| **Post** | Looks like a post in the list | Optional, 1080 × 1080 (square) | 600 × 600 | 60 characters | 280 characters | 2 MB (GIF 3 MB) |
| **Feature** | A large card with a tall picture | Required, 1080 × 1350 (4 : 5) | 720 × 900 | 60 characters | 140 characters | 3 MB (GIF 4 MB) |

- Larger pictures in the same shape are fine (they're scaled down); a shape off by more
  than about 3% is refused with a plain message ("This picture is the wrong shape for a
  banner. Use 1200 × 300 pixels (or the same shape, larger)").
- GIFs: one loop at most 8 seconds and 120 frames.
- Pictures and GIFs go through the same upload checks as posts (file type, size, content).

**Why these shapes:** 4 : 1 keeps a banner short enough not to push posts off the screen;
a square post-style ad sits naturally among photo posts; 4 : 5 is the tallest shape that
still fits a phone screen with its text, and is the size most people already have from
Instagram.

## Schedule, targeting and how often

- **Dates** (start and end) plus **days of the week** and **time of day**, in Jacksonville
  time, for example "Tue–Fri, 4:00 pm–7:00 pm". A window past midnight belongs to the day
  it starts ("Fri 10 pm–2 am" includes Saturday 1 am).
- **Targeting:** a radius around the place and/or chosen ZIP codes, matched against the
  reader's location reading only. At least one is required.
- **How often:** about one ad after every N posts (an admin setting; never first, never
  two in a row, at most one per business in a list); guests see them a little more often.
- **Plan slots:** live ads and scheduled ones count against the plan's limit (Q33).
