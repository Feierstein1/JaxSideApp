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

Shared building blocks live in `apps/mobile/src/ui.tsx` (`Field`, `PasswordField`, `Button`,
`FormError`, `headerOptions`, `switchColors`, `styles`). Reuse them instead of styling screens one by one.

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
