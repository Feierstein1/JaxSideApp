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

## Mobile app: dark theme everywhere (D79)

The phone app is dark on every screen: feeds, places, posts, profiles, Account, sign-in, forms,
sheets, policy pages. The admin portal keeps the light `COLORS`.

**In mobile code use `DARK` from `@jax/shared`, never `COLORS`.** Layers, darkest first:

| Token                                   | Hex       | Use                                                                        |
| --------------------------------------- | --------- | -------------------------------------------------------------------------- |
| `bar`                                   | `#000000` | Header, tab bar, and the control block under the header                    |
| `page`                                  | `#1E1F22` | Every screen's background                                                  |
| `card`                                  | `#2B2D31` | Posts, places, grouped lists, sheets                                       |
| `raised`                                | `#383A40` | Inputs, pills, chips, icon buttons                                         |
| `text`                                  | `#F2F3F5` | Main text                                                                  |
| `textMuted`                             | `#B5BAC1` | Secondary text                                                             |
| `accent`                                | `#3DB8C9` | Main buttons (black text), links, active tab, focus (D110: teal, was gold) |
| `teal`                                  | teal      | Switches, selected fills (white text)                                      |
| `tealText`                              | `#6CC5D4` | Teal for text and icons ("Confirmed", upvotes, post counts)                |
| `accentSoft` / `tealSoft` / `errorSoft` | tints     | Notice and status backgrounds                                              |

Brand teal is too dark to read as text on these greys (2.1:1), so `tealText` is a light tint of
it. Every text color is tested at 4.5:1 on `page`, `card` and `raised`, and input outlines
(`border`) at 3:1 (`theme.test.ts`).

**Art deco (D127, branch `ui/art-deco`):** shapes from the icon's stepped frame, all in
`apps/mobile/src/deco.tsx`: `StepEdge` under black header blocks; `DecoBox` with `chamfer`
(cards, list groups, search, Home's shared space), `chamferTop` (posts) or `arrow` (buttons,
chips, segmented switches, type tabs, vote and comment pills). Section titles and tabs are
spaced capitals in Josefin Sans (`FONT.deco`), section titles between ◆ diamonds. Other corners
are nearly square (`RADIUS`); circles stay round.

**Typeface:** Plus Jakarta Sans (free, Open Font License, `@expo-google-fonts`). Import `Text`
and `TextInput` from `@/text`, not from `react-native`: they pick the right font file for
`fontWeight` and default to the dark theme's text color. The one exception is the app's name in
the header, set in **Russo One** (`FONT.brand`, D120).

**Header (every screen):** black bar, the **JaxSide mark top-left**: the small icon emblem and
"JAXSIDE" in Russo One, JAX in the teal accent and SIDE in white (D120). The accent back arrow
sits before it on inner screens; messages and notifications on the right (no username, D119). No centered page names; an
inner page shows its own name at the top of the page with `PageTitle` (big title, optional line
and icon).

**Cards share one language:** a dark rounded card with a **thick colored stripe on the left**:

- **Posts:** the author's account color (D69). Photo ringed in that color, name with ★ and
  medals, "5 min ago · 120 yd" under it, the text, media, then vote and comment pills, and
  "Voice" / "2 photos" tags on the right. "Popular" tag at a score of 10+. Very dark account
  colors (navy, black) get a thin light edge so the stripe still shows.
- **Places:** the category color (D70) as the stripe and as an icon tile; name large;
  category · distance; posts and ★ count; a teal "You can post" badge when you're within the
  room radius; chevron.
- **Place page:** the same stripe and tile, bigger; address; three stat tiles (Away, Posts,
  Favorites); a full-width "Save to favorites" button (gold when saved).

**Home and Places top block (black):** "Near Avondale · within 528 yd" (tap → Account to change
the radius), then search pill + refresh (+ filters on Places), then the post-type tabs.

**Posting (D80):** the round + appears only when a feed has posts (an empty feed shows its own
"Start a post" button). The composer starts with a Text & photos / Voice switch; "Add a photo" is
a dashed gold button under the text. A place's post shows a fixed "Posted in [place]" strip.

**Account:** one page. Profile card (color band, photo with camera badge, name, joined, Edit
bio / Color / View buttons), About, Medals, then grouped settings cards.

**Keyboard (D192):** every place you can type stays above the keyboard on Android and iPhone:
`Screen` (keyboard-safe by default), `KeyboardSafeView` for custom layouts, and `Sheet` (it
rises above the keyboard by itself). Don't use `KeyboardAvoidingView`. A test
(`src/keyboard-standard.test.ts`) fails for a new file with a text box that uses none of them.

**Forms:** filled dark fields with a leading icon, gold outline while typing, error line with
an icon; primary button gold with black text, secondary raised grey, danger red outline.

### Category colors (D70)

Dark, clearly different hues, all with white text ≥ 4.5:1 (tested): Food `#B71C1C` red · Coffee
`#5D4037` brown · Bars `#6A1B9A` purple · Parks & outdoors `#1B5E20` green · Shopping `#AD1457`
magenta · Things to do `#BF360C` burnt orange · Services & auto `#0D47A1` blue · Hotels
`#00695C` teal-green · Other `#37474F` slate. Defined once as `CATEGORY_COLORS` in
`@jax/shared`.

## Pop-ups (D97)

Never use React Native's `Alert.alert` or `ActionSheetIOS`: they draw the phone's plain system
dialogs. Use `src/dialog.tsx`:

- `showAlert(title, message?, buttons?, { icon, tone })`: same arguments as `Alert.alert`. A dark
  rounded card, a toned icon circle (`info` / `warning` gold, `success` teal, `danger` red; a
  destructive button makes it `danger` automatically), the title, the message and buttons: the
  action gold, a destructive one red, Cancel grey. Two short buttons sit side by side (Cancel left);
  longer or more buttons stack (Cancel last). Back button or tapping outside = Cancel.
- `showMenu(title, items)` (or `openMenu` in `ui.tsx`): the "•••" menu as a bottom sheet, each
  action with an icon (destructive in red), Cancel as its own button below.

## Medals (D95)

Each medal has its own **shape and color**, so they can be told apart at 16 px and by people who
can't tell colors apart:

| Medal                | Earned by                                | Art                                                  |
| -------------------- | ---------------------------------------- | ---------------------------------------------------- |
| First Contribution   | First post or comment that stays up 24 h | Round **teal coin**: speech bubble with a gold spark |
| Approved Contributor | A suggested place is approved            | Gold **hexagon** badge: map pin with a check mark    |
| Well Received        | 5 different posts that each reach +3     | Gold **laurel rosette**: up arrow and five dots      |

`src/profile/MedalArt.tsx`: `MedalArt` (full medal with ribbon tails, for profiles) and
`MedalBadge` (simple badge next to names: 16 px on posts, 14 px on comments, 18 px on profiles).
Colors come from `MEDAL` in `@jax/shared`; symbols are white on teal and black on gold. A new
medal without artwork shows a plain old-gold star badge until it gets its own design.

## Components and tokens (D78, D79)

**Tokens** (`apps/mobile/src/tokens.ts`): spacing `SPACE` 2 · 4 · 8 · 12 · 16 · 24 · 32,
corners `RADIUS` 8 · 12 · 16 · 24 · pill, type `TYPE` display 44 · title 26 · headline 18 ·
body 16 · callout 15 · label 14 · caption 13 · overline 12 (caps), `elevation(1|2|3)`.

**Components** (`apps/mobile/src/ui.tsx`): `BrandMark`, `headerOptions`, `PageTitle`, `Screen`
(dark page + padding + keyboard), `Card`, `PressableScale`, `Field` (with `icon`),
`PasswordField`, `Button` (primary/gold, secondary, teal, danger, link), `FormError`, `Banner`
(info/success/error), `Chip`, `Segmented`, `IconButton`, `RefreshButton`, `SearchField`,
`FloatingButton`, `EmptyState`, `ErrorState`, `Pulse` + `Bone` (skeletons), `useToast`, `Sheet`,
`ListGroup` + `ListRow`, `SectionTitle`, `StatTile`, `StatusBadge`, `openMenu`. Place pieces
(`PlaceRow`, `PlaceHero`, `CategoryTile`) are in `src/places/PlaceHeader.tsx`.

**Patterns:** content first (sort and notices scroll away with the feed); skeletons while
loading; empty states with an icon, title, one helpful line and one action; secondary actions
(report, delete, block) in "•••" menus, destructive ones confirmed; light haptics on votes,
favorites, tabs and successful posts; every animation respects the phone's reduce-motion
setting.

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
