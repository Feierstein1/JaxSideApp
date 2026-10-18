# UI design notes

Read this before building any screen in the mobile app, admin portal or web account pages.

## Color scheme (D33)

The app uses the **Jacksonville Jaguars team colors plus white**.

| Name     | Hex       | RGB                | Swatch use                                    |
| -------- | --------- | ------------------ | --------------------------------------------- |
| Gold     | `#D8A328` | rgb(216, 163, 40)  | Accent: highlights, badges, active tab, focus |
| Teal     | `#136677` | rgb(19, 102, 119)  | Primary: main buttons, links, selected states |
| Black    | `#000000` | rgb(0, 0, 0)       | Text, navigation header, dark surfaces        |
| Old gold | `#9E7A2C` | rgb(158, 122, 44)  | Medals, borders, large text/icons only        |
| White    | `#FFFFFF` | rgb(255, 255, 255) | Main background, text on teal or black        |

Source: user-provided reference image (CodeofColors.com "Jacksonville Jaguars Color Codes"), 2026-10-15.

**In code, never type hex values in screens.** Import from `@jax/shared`:

- `BRAND`: the five raw colors above.
- `COLORS`: the semantic tokens screens actually use (`primary`, `onPrimary`, `accent`, `onAccent`,
  `accentSoft`, `text`, `textMuted`, `placeholder`, `border`, `error`, …).

`packages/shared/src/theme.test.ts` checks every text pairing for contrast. If you change a color,
that test tells you whether the result is still readable.

## Readability rules (WCAG AA: 4.5:1 for normal text, 3:1 for large text and icons)

| Pairing           | Contrast | Rule                                                |
| ----------------- | -------- | --------------------------------------------------- |
| White on teal     | 6.6:1    | ✅ Primary buttons                                  |
| Teal on white     | 6.6:1    | ✅ Links and text buttons                           |
| Black on gold     | 9.2:1    | ✅ Gold buttons, badges and chips use black text    |
| Gold on black     | 9.2:1    | ✅ Gold text or icons on the black header           |
| Old gold on black | 5.3:1    | ✅                                                  |
| Old gold on white | 4.0:1    | ⚠️ Large text (18pt+, or 14pt bold) and icons only  |
| **Gold on white** | 2.3:1    | ❌ Never for text. Decoration only (stripes, fills) |
| **White on gold** | 2.3:1    | ❌ Never                                            |
| **Gold on teal**  | 2.9:1    | ❌ Never for text                                   |
| Black on teal     | 3.2:1    | ❌ Never for normal text                            |

## Current conventions (mobile)

- **Navigation header:** black background, white title, gold back arrow. Status bar text is light.
- **Primary button:** teal fill, white text. **Text links:** teal.
- **Info banners:** light gold tint (`accentSoft`) with a gold left stripe and black text.
- **Switches:** teal when on.
- **Errors:** red `#B00020`. It's outside the brand palette on purpose, so errors never look like
  branding.
- **Background:** white.

Shared building blocks live in `apps/mobile/src/ui.tsx` (see "Design system" below). Reuse
them instead of styling screens one by one.

## Screen look (D69, D70)

- **Bars and backgrounds:** the header and the bar under it (search, feed controls) are black
  (`surfaceInverse`). Content behind cards is dark grey (`surfaceDark` #1E1F22), a visible step
  lighter than the bar. Text directly on it uses `onSurfaceDark` / `onSurfaceDarkMuted`, errors
  `errorOnDark`.
- **Posts:** white cards with black text, framed and headed in the author's **account color**
  (24-color palette in `@jax/shared/profile-colors.ts`; header text black or white, whichever
  reads ≥ 4.5:1).
- **Places:** cards with a 2 px black frame; the header uses the **category color** (below) with a
  white category pill and white name; distance and post count on a white row.
- **Round gold + button** bottom-right for every "create" action (new post, Add new place):
  `FloatingButton` in `src/ui.tsx`.

### Category colors (D70)

Dark, clearly different hues, all with white text ≥ 4.5:1 (tested): Food `#B71C1C` red · Coffee
`#5D4037` brown · Bars `#6A1B9A` purple · Parks & outdoors `#1B5E20` green · Shopping `#AD1457`
magenta · Things to do `#BF360C` burnt orange · Services & auto `#0D47A1` blue · Hotels
`#00695C` teal-green · Other `#37474F` slate. Defined once as `CATEGORY_COLORS` in
`@jax/shared`.

## Design system (D78, experimental redesign)

The 2026-10-18 redesign is **one commit** so it can be reverted as a whole. Colors are
unchanged (D33); what changed is structure, spacing, motion and components.

**Tokens** (`apps/mobile/src/tokens.ts`):

- Spacing `SPACE`: 2 · 4 · 8 · 12 · 16 · 24 · 32. Corners `RADIUS`: 8 · 12 · 16 · 24 · pill.
- Type `TYPE`: display 40 · title 24 · headline 18 · body 16 · callout 15 · label 14 ·
  caption 13 · overline 12 (caps). Use these instead of ad-hoc font sizes.
- `elevation(1|2|3)`: resting card, floating button, toast or sheet.
- New colors in `@jax/shared` (tested): `surfaceDarkRaised` (search pills, chips and icon
  buttons on black), `skeletonOnDark` / `skeletonOnLight` (loading shapes), `hairline`
  (dividers inside white cards), `errorSoft` (behind form errors).

**Components** (`apps/mobile/src/ui.tsx`): `PressableScale` (shrinks a little when pressed),
`Button` (primary, accent = gold, secondary, danger, link, linkOnDark, ghostOnDark; optional
icon), `Field` (teal 2 px outline while typing, `hint` line, error with an icon),
`PasswordField` (eye icon inside), `Banner`, `Chip` (`dark`, removable), `Segmented` (pill
track; `dark` = gold thumb), `IconButton`, `SearchField`, `FloatingButton`, `EmptyState`,
`ErrorState`, `Pulse` + `Bone` (skeletons), `useToast`, `Sheet` (bottom sheet with handle),
`ListGroup` + `ListRow` (grouped settings), `SectionTitle`, `openMenu` ("•••" menus).

**Patterns:**

- **Content first:** only search and the type tabs stay fixed above the feed; sort and
  notices scroll away. The neighborhood moves into the header as a subtitle.
- **Loading** shows skeletons shaped like the content; **empty** states have an icon, a
  title, one helpful line and (where it makes sense) one action; **errors** show the message
  with Try again.
- **Secondary actions** (report, delete, block) live in "•••" menus, not as loose links.
  Anything destructive asks first.
- **Feedback:** light haptics (`src/motion.ts`, `expo-haptics`, free and in Expo Go) on votes,
  favorites, tab switches and successful posts. Every animation checks the phone's reduce
  motion setting (`useReducedMotion`).
- **Two moods:** dark feeds (Home, Places, posts, profiles) and a light grey Account area with
  white grouped cards.
- **Post cards** keep the author's color header (D69) but drop the 3 px colored frame; the
  name and "time · distance" are stacked; votes and comments are pills. **Place cards** keep
  the category color (D70), add a category icon, and drop the 2 px black frame.

## Planned (not built yet)

- **Admin portal (Phase 5):** same tokens from `@jax/shared`.
- **Web account pages** (`/verify-email`, `/reset-password`): currently unstyled browser defaults.
  Apply the palette when the admin portal styling is built.
- **Medals and achievements (Phase 6):** gold and old gold are natural fits. Medal icons need
  3:1 against their background.
- **Dark mode:** not planned for the MVP. If added, black surfaces with gold accents already pass.

## Branding caution

Using a color palette is fine, but the app must not use Jaguars or NFL **names, logos, wordmarks or
mascot imagery**, or suggest any affiliation. That would be trademark infringement, and app stores
reject apps that impersonate brands. If the app ever wants an official tie-in, that needs a
licensing agreement.

## Planned: animations and an app mascot (user idea, 2026-10-18)

Not built yet; recorded so the UX/UI work picks it up.

- **An original app mascot** that reacts to what people do. It must be our own character, not
  the Jaguars' mascot or anything resembling it (see the trademark note above).
- **Celebrate:** a short mascot animation after a post goes up, when a medal (achievement) is
  unlocked, and for other good behavior (e.g. a first comment, a well-received post).
- **Disapprove:** the mascot looks upset when a post is blocked or held by screening for language
  that isn't allowed, alongside the plain explanation of what happened (the text message stays;
  the animation never replaces it).
- **Guidelines when built:**
  - Keep it short (about 1–2 seconds) and tappable to dismiss.
  - Don't block the next action.
  - Respect the phone's "reduce motion" setting by showing a still image instead.
  - Never shame or mock, even when disapproving.
  - Keep files small; likely Lottie or Rive animations, both free to use in Expo.
