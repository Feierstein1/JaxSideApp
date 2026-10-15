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

## Business directory: OpenStreetMap (P2.10, planned)

To be documented when the importer is built: Overpass query, tag allow-list, ODbL attribution
("© OpenStreetMap contributors"), and refresh steps.
