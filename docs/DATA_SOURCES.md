# Data sources

External data used by the app: where it comes from, its license, and how to refresh it.

## Service area boundary: Duval County (D15)

|                |                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**       | Legal boundary of Duval County, FL (GEOID `12031`): consolidated City of Jacksonville plus Jacksonville Beach, Atlantic Beach, Neptune Beach and Baldwin |
| **Source**     | US Census Bureau, TIGER/Line Shapefiles **2026**, Counties (national file)                                                                               |
| **URL**        | https://www2.census.gov/geo/tiger/TIGER2026/COUNTY/tl_2026_us_county.zip                                                                                 |
| **Vintage**    | TIGER2026 (legal boundaries as of Jan 1, 2026). File published 2026-10-07; retrieved 2026-10-15                                                          |
| **Checksum**   | SHA-256 of the downloaded zip: `b527c9ba7aeb8f17ef118f026eae5e5a938aa1d00b873bc32342d0dce59321c0`                                                        |
| **License**    | Public domain (US Government work). No attribution required; we credit the Census Bureau anyway                                                          |
| **Datum**      | NAD83 (EPSG:4269). Stored as WGS84 (EPSG:4326), which phones use. The difference in Florida is about 1 m, well under GPS accuracy                        |
| **Stored at**  | `apps/server/data/boundaries/duval-county.geojson` (committed, 2,148 points, about 50 KB) → `ServiceArea` table, key `duval`                             |
| **Size check** | 918.5 sq mi total = 762.7 sq mi land + 155.8 sq mi water, matching the Census `ALAND` + `AWATER` figures                                                 |

**Coverage notes**

- The boundary includes coastal and river waters (the St. Johns River, and state waters off the
  Beaches), so people on the sand, the riverfront, boats or bridges inside the county count as
  inside.
- Neighboring counties (Nassau, Baker, Clay, St. Johns) are outside. For example, Orange Park
  (Clay County) and Ponte Vedra Beach (St. Johns County) can't post.

**Refreshing (yearly, or if the boundary changes)**

1. `npm run fetch:boundary -w @jax/server -- 2027` downloads the new national file (about 83 MB)
   to a temporary folder, extracts Duval, rewrites the GeoJSON, and deletes the download.
2. Update the table above (vintage, URL, checksum, dates) and review the GeoJSON diff.
3. `npm run import:boundary -w @jax/server` loads it. This is safe to re-run; the seed runs it too.

**Swapping the service area** (e.g. adding a neighboring county later): add another feature with
a new `key`. The location check accepts a point inside **any** active `ServiceArea` row.

## Neighborhood names (D72)

|               |                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **What**      | About 240 named points (one per neighborhood) used for the "Near Avondale" label. Points only; no outlines                                                                                                                                                                     |
| **Sources**   | 1. Our own pins, `apps/server/data/neighborhoods/additions.json` (these win). 2. OpenStreetMap via Overpass: `place` = neighbourhood, suburb, quarter, hamlet, village, town. 3. City of Jacksonville GIS, "Neighborhood Names" (`maps.coj.net/.../PromisesKept/MapServer/21`) |
| **License**   | OSM: **ODbL 1.0**, "© OpenStreetMap contributors" (shown in the app with place lists). City layer: no license stated; reuse to be confirmed (Q16)                                                                                                                              |
| **Stored at** | `apps/server/data/neighborhoods/duval-neighborhoods.json` (committed; bundled with the server, so no outside call at run time)                                                                                                                                                 |
| **Code**      | `apps/server/scripts/neighborhoods/fetch-neighborhoods.ts` (build); `apps/server/src/server/location/neighborhood.ts` (lookup)                                                                                                                                                 |

**How the file is built:** points outside the committed Duval boundary are dropped. This matters
because the OSM area "Duval County" also matches Duval County, Texas. Cemeteries are dropped. The
same name within 2 km counts once, in priority order: our pins, OSM neighborhoods, OSM hamlets,
then the city's points.

**How it's used:** the closest point to the person's verified location, if within 5 km. Near a
border it can name the neighbor; a neighborhood missing from every source shows as the closest
listed one until we pin it.

**Adding a missing neighborhood:** add `{ "name", "lat", "lon" }` (its rough center) to
`additions.json`, then run `npm run fetch:neighborhoods -w @jax/server` and commit both files.

## Business directory: OpenStreetMap (P2.10–P2.12)

|               |                                                                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**      | Named, public-facing places inside Duval County: restaurants, cafés, bars, shops, car dealers, parks, beaches, attractions, museums, hotels, gyms and similar                                                                                                                                                        |
| **Source**    | OpenStreetMap, queried through the Overpass API (`https://overpass-api.de/api/interpreter`, configurable with `OVERPASS_URL`)                                                                                                                                                                                        |
| **License**   | **ODbL 1.0.** Attribution is required: "© OpenStreetMap contributors" with a link to https://www.openstreetmap.org/copyright. The app shows it under every place list and place page, and the API returns it with search results. If we ever publish a modified copy of the dataset itself, ODbL share-alike applies |
| **Stored at** | `BusinessPlace` rows with `sourceName = 'osm'`, `sourceId = 'node/123'` (or `way/`, `relation/`), `attribution = '© OpenStreetMap contributors'`                                                                                                                                                                     |
| **Code**      | `apps/server/src/server/directory/osm.ts` (allow-list, normalization, import); `apps/server/scripts/directory/import-osm.ts` (download)                                                                                                                                                                              |

**What's included:** only allow-listed tags (`RULES` in `osm.ts`), and only features with a `name`.
Offices, homes and infrastructure (parking, benches) are never requested. `shop=vacant` is skipped.

**Duplicates (P2.11):** within an import, the same normalized name within 50 m counts as one place
(a point is kept over a building outline). A place already in the directory from another source,
such as an approved community submission, isn't added again.

**Refreshing**

```sh
npm run import:places -w @jax/server
```

- The county is fetched as a 4×4 grid of small queries, 5 seconds apart, with backoff when the
  public server is busy (it often is). Finished tiles are saved per day under
  `apps/server/data/osm/` (git-ignored), so a rerun after a failure only fetches the missing tiles.
- **Idempotent:** a rerun updates changed places in place (same ID), inserts new ones, and marks
  places that vanished from OSM `INACTIVE` (they come back if they reappear). If a download looks
  truncated (under half the current count), nothing is deactivated.
- To re-import a saved download without the network:
  `npm run import:places -w @jax/server -- --from-file <file>`.
- **Etiquette:** the public Overpass server is meant for light use. Refresh at most weekly. For
  frequent or large refreshes, use a self-hosted Overpass instance or a Geofabrik extract.
