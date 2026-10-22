# Map assets

- `Ionicons.ttf`: the Ionicons icon font (MIT License, Ionic; as shipped in `@expo/vector-icons`),
  the same icons the app uses. The map page draws the category icons on its markers with it
  (D113). Served by `GET /api/v1/map/font`. Glyph codes are in `src/server/map/icons.ts`; a test
  checks they match the app's copy.
