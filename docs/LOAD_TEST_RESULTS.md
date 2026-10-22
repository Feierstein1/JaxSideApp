# Load Test Results (P13.10)

Run 2026-10-22 04:55 UTC on the development machine
(Docker: 2 CPUs, 3 GB memory), database `jax_load`, filled by `npm run load:seed`
at scale 0.2. Each time is the median of 5 runs after one warm-up,
measured from Node (so it includes Prisma and the driver, not the network).

## Findings

- **Every path the app uses is fast at this size: all under 20 ms**, most under 10 ms, each one
  statement or a few. Every query plan uses indexes on the big tables (votes, comments, posts,
  messages, notifications, location history).
- **Admin queue, 59 ms:** its slowest statement is 6 ms; the rest is the server assembling about
  320 open cases. Fine for an admin page; worth paging if the open queue ever reaches thousands.
- **"Seq Scan on MessageHide"** in the chat list and unread badge is on an empty table (nobody in
  the test data deleted messages for themselves); with rows, it uses its `(messageId, userId)` key.
- **Scale:** this is one fifth of the review's launch estimate (posts, votes, messages); users are
  the full 50k. The plans are the shape Postgres uses at full size (index lookups bounded by
  radius, chat or user), so times should grow slowly, not 5×. To confirm before launch, run the
  same scripts with `LOAD_SCALE=1` on the production database server.
- No changes needed from this run.

## Data

| users | area_posts | place_posts | comments | votes   | messages | chats  | notifications | location_checks | size    |
| ----- | ---------- | ----------- | -------- | ------- | -------- | ------ | ------------- | --------------- | ------- |
| 50000 | 160000     | 40000       | 600000   | 4000000 | 2000000  | 100000 | 500000        | 1000000         | 2523 MB |

## Timings

| Path                    |  Median | Queries | Slowest statement | Big-table full scans              |
| ----------------------- | ------: | ------: | ----------------: | --------------------------------- |
| Area feed, newest       | 19.3 ms |       1 |             13 ms | none                              |
| Area feed, top (7 days) |  8.6 ms |       1 |              8 ms | none                              |
| Area feed, @name search |  9.9 ms |       1 |              9 ms | none                              |
| Place discussion        |  4.4 ms |       1 |              4 ms | none                              |
| Chat list               |  3.2 ms |       1 |              3 ms | `->  Seq Scan on "MessageHide" h` |
| Unread chats badge      |  1.9 ms |       1 |              2 ms | `->  Seq Scan on "MessageHide" h` |
| Notification badge      |  2.3 ms |       1 |              1 ms | none                              |
| Notification list       | 12.0 ms |       4 |              4 ms | none                              |
| Friends feed            |  9.3 ms |       4 |              4 ms | none                              |
| Places near you         |  2.5 ms |       1 |              2 ms | none                              |
| Places search by name   |  3.2 ms |       1 |              5 ms | none                              |
| Profile: their posts    |  3.8 ms |       1 |              4 ms | none                              |
| Profile: your posts     |  6.3 ms |       2 |              9 ms | none                              |
| Admin queue             | 58.7 ms |       3 |              6 ms | none                              |

## Query plans of the slowest statements

### Area feed, newest

13.337599999998929 ms:

```sql
 SELECT p.id, p.body, p."createdAt", p."editedAt", p.score, p."upCount", p."downCount", p."commentCount", p."authorId", u.username, u.status::text AS author_status, coalesce(pr.color, 'teal') AS author_color, pr."avatarPhotoId" AS avatar_photo_id, COALESCE((SELECT array_agg(a.key ORDER BY a.key) FROM "UserAchievement" ua JOIN "Achievement" a ON a.id = ua."achievementId" WHERE ua."userId" = p."authorId" AND a.active), '{}'::varchar[]) AS medals, (SELECT json_agg(json_build_object('id', ph.id, 'width', ph.width, 'height', ph.height) ORDER BY ph."createdAt") FROM "Photo" ph WHERE ph."generalPostId" = p.id AND ph.status = 'ACTIVE' AND ph.kind = 'IMAGE') AS photos, (SELECT json_build_object('id', vc.id, 'durationMs', vc."durationMs") FROM "Photo" vc WHERE vc."generalPostId" = p.id AND vc.status = 'ACTIVE' AND vc.kind = 'AUDIO' LIMIT 1) AS voice, (SELECT json_build_object('id', vd.id, 'durationMs', vd."durationMs", 'width', vd.width, 'height', vd.height) FROM "Photo" vd WHERE vd."generalPostId" = p.id AND vd.status = 'ACTIVE' AND vd.kind = 'VIDEO' LIMIT 1) AS video, v.value AS my_vote, ST_Distance(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance, NULL::uuid AS place_id, NULL::text AS place_name, false AS is_owner FROM "GeneralPost" p JOIN "User" u ON u.id = p."authorId" LEFT JOIN "Profile" pr ON pr."userId" = u.id LEFT JOIN "Vote" v ON v."generalPostId" = p.id AND v."voterId" = $3::uuid WHERE p.status = 'VISIBLE' AND ST_DWithin(p.location, ST_SetSRID(ST_Ma
```

```
Limit  (cost=14700.56..14918.72 rows=16 width=399) (actual time=24.815..24.914 rows=16 loops=1)
  Buffers: shared hit=6540
  ->  Result  (cost=14700.56..14918.72 rows=16 width=399) (actual time=24.813..24.911 rows=16 loops=1)
        Buffers: shared hit=6540
        ->  Sort  (cost=14700.56..14700.60 rows=16 width=359) (actual time=24.743..24.747 rows=16 loops=1)
              Sort Key: p."createdAt" DESC, p.id DESC
              Sort Method: top-N heapsort  Memory: 32kB
              Buffers: shared hit=6537
              ->  Nested Loop Anti Join  (cost=40.70..14700.24 rows=16 width=359) (actual time=16.671..24.161 rows=622 loops=1)
                    Join Filter: (((b."blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND (b."blockedId" = p."authorId")) OR ((b."blockerId" = p."authorId") AND (b."blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)))
                    Buffers: shared hit=6534
                    ->  Nested Loop Left Join  (cost=40.70..14699.76 rows=16 width=191) (actual time=16.612..21.984 rows=622 loops=1)
                          Buffers: shared hit=6531
                          ->  Nested Loop Left Join  (cost=40.27..14564.36 rows=16 width=189) (actual time=16.586..21.059 rows=622 loops=1)
                                Buffers: shared hit=4663
                                ->  Nested Loop  (cost=39.98..14558.72 rows=16 width=184) (actual time=16.578..19.762 rows=622 loops=1)
                                      Buffers: shared hit=2797
                                      ->  Bitmap Heap Scan on "GeneralPost" p  (cost=39.69..14425.80 rows=16 width=154) (actual time=16.534..18.192 rows=622 loops=1)
                                            Filter: ((status = 'VISIBLE'::"ContentStatus") AND st_dwithin(location, '0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, '482.8032'::double precision, true))
                                            Rows Removed by Filter: 316
                                            Heap Blocks: exact=817
                                            Buffers: shared hit=931
                                            ->  Bitmap Index Scan on "GeneralPost_location_idx"  (cost=0.00..39.69 rows=971 width=0) (actual time=0.566..0.567 rows=938 loops=1)
                                                  Index Cond: (location && _st_expand('0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, '482.8032'::double precision))
                                                  Buffers: shared hit=35
                                      ->  Index Scan using "User_pkey" on "User" u  (cost=0.29..8.31 rows=1 width=30) (actual time=0.002..0.002 rows=1 loops=622)
                                            Index Cond: (id = p."authorId")
                                            Buffers: shared hit=1866
                                ->  Index Scan using "Profile_pkey" on "Profile" pr  (cost=0.29..0.35 rows=1 width=37) (actual time=0.002..0.002 rows=1 loops=622)
                                      Index Cond: ("userId" = u.id)
                                      Buffers: shared hit=1866
                          ->  Index Scan using "Vote_voterId_generalPostId_key" on "Vote" v  (cost=0.43..8.45 rows=1 width=18) (actual time=0.001..0.001 rows=0 loops=622)
                                Index Cond: (("voterId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND ("generalPostId" = p.id))
                                Buffers: shared hit=1868
                    ->  Seq Scan on "UserBlock" b  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=622)
                          Filter: (("blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) OR ("blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid))
                    SubPlan 3
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=622)
                            ->  Seq Scan on "Photo" vc  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=622)
                                  Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'AUDIO'::"MediaKind"))
                    SubPlan 4
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=622)
                            ->  Seq Scan on "Photo" vd  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=622)
                                  Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'VIDEO'::"MediaKind"))
        SubPlan 1
          ->  Aggregate  (cost=1.07..1.08 rows=1 width=32) (actual time=0.005..0.005 rows=1 loops=16)
                Buffers: shared hit=3
                ->  Sort  (cost=1.06..1.07 rows=1 width=18) (actual time=0.005..0.005 rows=0 loops=16)
                      Sort Key: a.key
                      Sort Method: quicksort  Memory: 25kB
                      Buffers: shared hit=3
                      ->  Hash Join  (cost=0.01..1.05 rows=1 width=18) (actual time=0.002..0.002 rows=0 loops=16)
                            Hash Cond: (a.id = ua."achievementId")
                            ->  Seq Scan on "Achievement" a  (cost=0.00..1.03 rows=3 width=34) (never executed)
                                  Filter: active
                            ->  Hash  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=16)
                                  Buckets: 1024  Batches: 1  Memory Usage: 8kB
                                  ->  Seq Scan on "UserAchievement" ua  (cost=0.00..0.00 rows=1 width=16) (actual time=0.000..0.000 rows=0 loops=16)
                                        Filter: ("userId" = p."authorId")
        SubPlan 2
          ->  Aggregate  (cost=0.02..0.03 rows=1 width=32) (actual time=0.002..0.002 rows=1 loops=16)
                ->  Sort  (cost=0.01..0.02 rows=1 width=32) (actual time=0.002..0.002 rows=0 loops=16)
                      Sort Key: ph."createdAt"
                      Sort Method: quicksort  Memory: 25kB
                      ->  Seq Scan on "Photo" ph  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=16)
                            Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'IMAGE'::"MediaKind"))
Planning:
  Buffers: shared hit=625
Planning Time: 61.914 ms
Execution Time: 25.214 ms
```

### Area feed, top (7 days)

8.200000000000728 ms:

```sql
 SELECT p.id, p.body, p."createdAt", p."editedAt", p.score, p."upCount", p."downCount", p."commentCount", p."authorId", u.username, u.status::text AS author_status, coalesce(pr.color, 'teal') AS author_color, pr."avatarPhotoId" AS avatar_photo_id, COALESCE((SELECT array_agg(a.key ORDER BY a.key) FROM "UserAchievement" ua JOIN "Achievement" a ON a.id = ua."achievementId" WHERE ua."userId" = p."authorId" AND a.active), '{}'::varchar[]) AS medals, (SELECT json_agg(json_build_object('id', ph.id, 'width', ph.width, 'height', ph.height) ORDER BY ph."createdAt") FROM "Photo" ph WHERE ph."generalPostId" = p.id AND ph.status = 'ACTIVE' AND ph.kind = 'IMAGE') AS photos, (SELECT json_build_object('id', vc.id, 'durationMs', vc."durationMs") FROM "Photo" vc WHERE vc."generalPostId" = p.id AND vc.status = 'ACTIVE' AND vc.kind = 'AUDIO' LIMIT 1) AS voice, (SELECT json_build_object('id', vd.id, 'durationMs', vd."durationMs", 'width', vd.width, 'height', vd.height) FROM "Photo" vd WHERE vd."generalPostId" = p.id AND vd.status = 'ACTIVE' AND vd.kind = 'VIDEO' LIMIT 1) AS video, v.value AS my_vote, ST_Distance(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance, NULL::uuid AS place_id, NULL::text AS place_name, false AS is_owner FROM "GeneralPost" p JOIN "User" u ON u.id = p."authorId" LEFT JOIN "Profile" pr ON pr."userId" = u.id LEFT JOIN "Vote" v ON v."generalPostId" = p.id AND v."voterId" = $3::uuid WHERE p.status = 'VISIBLE' AND ST_DWithin(p.location, ST_SetSRID(ST_Ma
```

```
Limit  (cost=2727.80..2755.07 rows=2 width=399) (actual time=3.235..3.333 rows=16 loops=1)
  Buffers: shared hit=883
  ->  Result  (cost=2727.80..2755.07 rows=2 width=399) (actual time=3.234..3.330 rows=16 loops=1)
        Buffers: shared hit=883
        ->  Sort  (cost=2727.80..2727.80 rows=2 width=359) (actual time=3.207..3.210 rows=16 loops=1)
              Sort Key: p.score DESC, p."createdAt" DESC, p.id DESC
              Sort Method: top-N heapsort  Memory: 31kB
              Buffers: shared hit=883
              ->  Nested Loop Anti Join  (cost=825.47..2727.79 rows=2 width=359) (actual time=2.007..3.136 rows=67 loops=1)
                    Join Filter: (((b."blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND (b."blockedId" = p."authorId")) OR ((b."blockerId" = p."authorId") AND (b."blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)))
                    Buffers: shared hit=880
                    ->  Nested Loop Left Join  (cost=825.47..2727.73 rows=2 width=191) (actual time=1.993..2.834 rows=67 loops=1)
                          Buffers: shared hit=880
                          ->  Nested Loop Left Join  (cost=825.04..2710.63 rows=2 width=189) (actual time=1.988..2.698 rows=67 loops=1)
                                Buffers: shared hit=679
                                ->  Nested Loop  (cost=824.75..2709.92 rows=2 width=184) (actual time=1.983..2.455 rows=67 loops=1)
                                      Buffers: shared hit=478
                                      ->  Bitmap Heap Scan on "GeneralPost" p  (cost=824.46..2693.31 rows=2 width=154) (actual time=1.973..2.202 rows=67 loops=1)
                                            Recheck Cond: ((status = 'VISIBLE'::"ContentStatus") AND ("createdAt" > (now() - '7 days'::interval)))
                                            Filter: st_dwithin(location, '0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, '482.8032'::double precision, true)
                                            Rows Removed by Filter: 32
                                            Heap Blocks: exact=99
                                            Buffers: shared hit=277
                                            ->  BitmapAnd  (cost=824.46..824.46 rows=117 width=0) (actual time=1.945..1.946 rows=0 loops=1)
                                                  Buffers: shared hit=178
                                                  ->  Bitmap Index Scan on "GeneralPost_location_idx"  (cost=0.00..39.69 rows=971 width=0) (actual time=0.593..0.593 rows=938 loops=1)
                                                        Index Cond: (location && _st_expand('0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, '482.8032'::double precision))
                                                        Buffers: shared hit=35
                                                  ->  Bitmap Index Scan on "GeneralPost_status_createdAt_id_idx"  (cost=0.00..784.52 rows=19210 width=0) (actual time=1.319..1.319 rows=18875 loops=1)
                                                        Index Cond: ((status = 'VISIBLE'::"ContentStatus") AND ("createdAt" > (now() - '7 days'::interval)))
                                                        Buffers: shared hit=143
                                      ->  Index Scan using "User_pkey" on "User" u  (cost=0.29..8.31 rows=1 width=30) (actual time=0.003..0.003 rows=1 loops=67)
                                            Index Cond: (id = p."authorId")
                                            Buffers: shared hit=201
                                ->  Index Scan using "Profile_pkey" on "Profile" pr  (cost=0.29..0.35 rows=1 width=37) (actual time=0.003..0.003 rows=1 loops=67)
                                      Index Cond: ("userId" = u.id)
                                      Buffers: shared hit=201
                          ->  Index Scan using "Vote_voterId_generalPostId_key" on "Vote" v  (cost=0.43..8.45 rows=1 width=18) (actual time=0.002..0.002 rows=0 loops=67)
                                Index Cond: (("voterId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND ("generalPostId" = p.id))
                                Buffers: shared hit=201
                    ->  Seq Scan on "UserBlock" b  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=67)
                          Filter: (("blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) OR ("blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid))
                    SubPlan 3
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=67)
                            ->  Seq Scan on "Photo" vc  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=67)
                                  Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'AUDIO'::"MediaKind"))
                    SubPlan 4
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=67)
                            ->  Seq Scan on "Photo" vd  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=67)
                                  Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'VIDEO'::"MediaKind"))
        SubPlan 1
          ->  Aggregate  (cost=1.07..1.08 rows=1 width=32) (actual time=0.003..0.003 rows=1 loops=16)
                ->  Sort  (cost=1.06..1.07 rows=1 width=18) (actual time=0.003..0.003 rows=0 loops=16)
                      Sort Key: a.key
                      Sort Method: quicksort  Memory: 25kB
                      ->  Hash Join  (cost=0.01..1.05 rows=1 width=18) (actual time=0.002..0.002 rows=0 loops=16)
                            Hash Cond: (a.id = ua."achievementId")
                            ->  Seq Scan on "Achievement" a  (cost=0.00..1.03 rows=3 width=34) (never executed)
                                  Filter: active
                            ->  Hash  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=16)
                                  Buckets: 1024  Batches: 1  Memory Usage: 8kB
                                  ->  Seq Scan on "UserAchievement" ua  (cost=0.00..0.00 rows=1 width=16) (actual time=0.000..0.000 rows=0 loops=16)
                                        Filter: ("userId" = p."authorId")
        SubPlan 2
          ->  Aggregate  (cost=0.02..0.03 rows=1 width=32) (actual time=0.002..0.002 rows=1 loops=16)
                ->  Sort  (cost=0.01..0.02 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=16)
                      Sort Key: ph."createdAt"
                      Sort Method: quicksort  Memory: 25kB
                      ->  Seq Scan on "Photo" ph  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=16)
                            Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'IMAGE'::"MediaKind"))
Planning:
  Buffers: shared hit=94
Planning Time: 3.405 ms
Execution Time: 3.467 ms
```

### Area feed, @name search

8.954799999999523 ms:

```sql
 SELECT p.id, p.body, p."createdAt", p."editedAt", p.score, p."upCount", p."downCount", p."commentCount", p."authorId", u.username, u.status::text AS author_status, coalesce(pr.color, 'teal') AS author_color, pr."avatarPhotoId" AS avatar_photo_id, COALESCE((SELECT array_agg(a.key ORDER BY a.key) FROM "UserAchievement" ua JOIN "Achievement" a ON a.id = ua."achievementId" WHERE ua."userId" = p."authorId" AND a.active), '{}'::varchar[]) AS medals, (SELECT json_agg(json_build_object('id', ph.id, 'width', ph.width, 'height', ph.height) ORDER BY ph."createdAt") FROM "Photo" ph WHERE ph."generalPostId" = p.id AND ph.status = 'ACTIVE' AND ph.kind = 'IMAGE') AS photos, (SELECT json_build_object('id', vc.id, 'durationMs', vc."durationMs") FROM "Photo" vc WHERE vc."generalPostId" = p.id AND vc.status = 'ACTIVE' AND vc.kind = 'AUDIO' LIMIT 1) AS voice, (SELECT json_build_object('id', vd.id, 'durationMs', vd."durationMs", 'width', vd.width, 'height', vd.height) FROM "Photo" vd WHERE vd."generalPostId" = p.id AND vd.status = 'ACTIVE' AND vd.kind = 'VIDEO' LIMIT 1) AS video, v.value AS my_vote, ST_Distance(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance, NULL::uuid AS place_id, NULL::text AS place_name, false AS is_owner FROM "GeneralPost" p JOIN "User" u ON u.id = p."authorId" LEFT JOIN "Profile" pr ON pr."userId" = u.id LEFT JOIN "Vote" v ON v."generalPostId" = p.id AND v."voterId" = $3::uuid WHERE p.status = 'VISIBLE' AND ST_DWithin(p.location, ST_SetSRID(ST_Ma
```

```
Limit  (cost=14595.00..14649.54 rows=4 width=399) (actual time=5.928..6.032 rows=16 loops=1)
  Buffers: shared hit=3696
  ->  Result  (cost=14595.00..14649.54 rows=4 width=399) (actual time=5.927..6.029 rows=16 loops=1)
        Buffers: shared hit=3696
        ->  Sort  (cost=14595.00..14595.01 rows=4 width=359) (actual time=5.883..5.886 rows=16 loops=1)
              Sort Key: p."createdAt" DESC, p.id DESC
              Sort Method: top-N heapsort  Memory: 31kB
              Buffers: shared hit=3696
              ->  Nested Loop Anti Join  (cost=40.70..14594.96 rows=4 width=359) (actual time=0.587..5.792 rows=163 loops=1)
                    Join Filter: (((b."blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND (b."blockedId" = p."authorId")) OR ((b."blockerId" = p."authorId") AND (b."blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)))
                    Buffers: shared hit=3696
                    ->  Nested Loop Left Join  (cost=40.70..14594.84 rows=4 width=191) (actual time=0.572..5.008 rows=163 loops=1)
                          Buffers: shared hit=3696
                          ->  Nested Loop Left Join  (cost=40.27..14560.84 rows=4 width=189) (actual time=0.565..4.677 rows=163 loops=1)
                                Buffers: shared hit=3207
                                ->  Nested Loop  (cost=39.98..14558.80 rows=4 width=184) (actual time=0.558..4.230 rows=163 loops=1)
                                      Buffers: shared hit=2718
                                      ->  Bitmap Heap Scan on "GeneralPost" p  (cost=39.69..14425.80 rows=16 width=154) (actual time=0.523..2.408 rows=622 loops=1)
                                            Filter: ((status = 'VISIBLE'::"ContentStatus") AND st_dwithin(location, '0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, '482.8032'::double precision, true))
                                            Rows Removed by Filter: 316
                                            Heap Blocks: exact=817
                                            Buffers: shared hit=852
                                            ->  Bitmap Index Scan on "GeneralPost_location_idx"  (cost=0.00..39.69 rows=971 width=0) (actual time=0.409..0.409 rows=938 loops=1)
                                                  Index Cond: (location && _st_expand('0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, '482.8032'::double precision))
                                                  Buffers: shared hit=35
                                      ->  Index Scan using "User_pkey" on "User" u  (cost=0.29..8.31 rows=1 width=30) (actual time=0.003..0.003 rows=0 loops=622)
                                            Index Cond: (id = p."authorId")
                                            Filter: ((status <> 'DELETED'::"AccountStatus") AND (("usernameNormalized")::text ~~ 'load\_1%'::text))
                                            Rows Removed by Filter: 1
                                            Buffers: shared hit=1866
                                ->  Index Scan using "Profile_pkey" on "Profile" pr  (cost=0.29..0.51 rows=1 width=37) (actual time=0.002..0.002 rows=1 loops=163)
                                      Index Cond: ("userId" = u.id)
                                      Buffers: shared hit=489
                          ->  Index Scan using "Vote_voterId_generalPostId_key" on "Vote" v  (cost=0.43..8.45 rows=1 width=18) (actual time=0.002..0.002 rows=0 loops=163)
                                Index Cond: (("voterId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND ("generalPostId" = p.id))
                                Buffers: shared hit=489
                    ->  Seq Scan on "UserBlock" b  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=163)
                          Filter: (("blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) OR ("blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid))
                    SubPlan 3
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=163)
                            ->  Seq Scan on "Photo" vc  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=163)
                                  Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'AUDIO'::"MediaKind"))
                    SubPlan 4
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=163)
                            ->  Seq Scan on "Photo" vd  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=163)
                                  Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'VIDEO'::"MediaKind"))
        SubPlan 1
          ->  Aggregate  (cost=1.07..1.08 rows=1 width=32) (actual time=0.004..0.004 rows=1 loops=16)
                ->  Sort  (cost=1.06..1.07 rows=1 width=18) (actual time=0.004..0.004 rows=0 loops=16)
                      Sort Key: a.key
                      Sort Method: quicksort  Memory: 25kB
                      ->  Hash Join  (cost=0.01..1.05 rows=1 width=18) (actual time=0.002..0.002 rows=0 loops=16)
                            Hash Cond: (a.id = ua."achievementId")
                            ->  Seq Scan on "Achievement" a  (cost=0.00..1.03 rows=3 width=34) (never executed)
                                  Filter: active
                            ->  Hash  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=16)
                                  Buckets: 1024  Batches: 1  Memory Usage: 8kB
                                  ->  Seq Scan on "UserAchievement" ua  (cost=0.00..0.00 rows=1 width=16) (actual time=0.000..0.000 rows=0 loops=16)
                                        Filter: ("userId" = p."authorId")
        SubPlan 2
          ->  Aggregate  (cost=0.02..0.03 rows=1 width=32) (actual time=0.002..0.002 rows=1 loops=16)
                ->  Sort  (cost=0.01..0.02 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=16)
                      Sort Key: ph."createdAt"
                      Sort Method: quicksort  Memory: 25kB
                      ->  Seq Scan on "Photo" ph  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=16)
                            Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'IMAGE'::"MediaKind"))
Planning:
  Buffers: shared hit=108
Planning Time: 1.791 ms
Execution Time: 6.133 ms
```

### Place discussion

4.10479999999734 ms:

```sql
 SELECT p.id, p.body, p."createdAt", p."editedAt", p.score, p."upCount", p."downCount", p."commentCount", p."authorId", u.username, u.status::text AS author_status, coalesce(pr.color, 'teal') AS author_color, pr."avatarPhotoId" AS avatar_photo_id, COALESCE((SELECT array_agg(a.key ORDER BY a.key) FROM "UserAchievement" ua JOIN "Achievement" a ON a.id = ua."achievementId" WHERE ua."userId" = p."authorId" AND a.active), '{}'::varchar[]) AS medals, (SELECT json_agg(json_build_object('id', ph.id, 'width', ph.width, 'height', ph.height) ORDER BY ph."createdAt") FROM "Photo" ph WHERE ph."businessPostId" = p.id AND ph.status = 'ACTIVE' AND ph.kind = 'IMAGE') AS photos, (SELECT json_build_object('id', vc.id, 'durationMs', vc."durationMs") FROM "Photo" vc WHERE vc."businessPostId" = p.id AND vc.status = 'ACTIVE' AND vc.kind = 'AUDIO' LIMIT 1) AS voice, (SELECT json_build_object('id', vd.id, 'durationMs', vd."durationMs", 'width', vd.width, 'height', vd.height) FROM "Photo" vd WHERE vd."businessPostId" = p.id AND vd.status = 'ACTIVE' AND vd.kind = 'VIDEO' LIMIT 1) AS video, v.value AS my_vote, NULL::float8 AS distance, pl.id AS place_id, pl.name AS place_name, EXISTS (SELECT 1 FROM "OwnerClaim" oc WHERE oc."placeId" = pl.id AND oc."userId" = p."authorId" AND oc.status = 'VERIFIED') AS is_owner FROM "BusinessPost" p JOIN "User" u ON u.id = p."authorId" LEFT JOIN "Profile" pr ON pr."userId" = u.id JOIN "BusinessPlace" pl ON pl.id = p."placeId" LEFT JOIN "Vote" v ON v."businessPostId" = p.
```

```
Limit  (cost=202.80..214.15 rows=10 width=385) (actual time=0.210..0.256 rows=10 loops=1)
  Buffers: shared hit=94
  ->  Result  (cost=202.80..214.15 rows=10 width=385) (actual time=0.210..0.254 rows=10 loops=1)
        Buffers: shared hit=94
        ->  Sort  (cost=202.80..202.82 rows=10 width=321) (actual time=0.195..0.198 rows=10 loops=1)
              Sort Key: p."createdAt" DESC, p.id DESC
              Sort Method: quicksort  Memory: 27kB
              Buffers: shared hit=94
              ->  Nested Loop Anti Join  (cost=43.01..202.63 rows=10 width=321) (actual time=0.078..0.190 rows=10 loops=1)
                    Join Filter: (((b."blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND (b."blockedId" = p."authorId")) OR ((b."blockerId" = p."authorId") AND (b."blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)))
                    Buffers: shared hit=94
                    ->  Nested Loop  (cost=43.01..202.33 rows=10 width=193) (actual time=0.067..0.142 rows=10 loops=1)
                          Buffers: shared hit=94
                          ->  Index Scan using "BusinessPlace_pkey" on "BusinessPlace" pl  (cost=0.28..8.30 rows=1 width=31) (actual time=0.007..0.008 rows=1 loops=1)
                                Index Cond: (id = '01a161ee-d7b7-7e66-82f7-8562f7fa9f31'::uuid)
                                Buffers: shared hit=3
                          ->  Nested Loop Left Join  (cost=42.73..193.93 rows=10 width=178) (actual time=0.059..0.131 rows=10 loops=1)
                                Buffers: shared hit=91
                                ->  Nested Loop  (cost=42.44..190.41 rows=10 width=173) (actual time=0.056..0.105 rows=10 loops=1)
                                      Buffers: shared hit=61
                                      ->  Merge Right Join  (cost=42.15..107.33 rows=10 width=143) (actual time=0.050..0.072 rows=10 loops=1)
                                            Merge Cond: (v."businessPostId" = p.id)
                                            Buffers: shared hit=31
                                            ->  Index Scan using "Vote_voterId_businessPostId_key" on "Vote" v  (cost=0.43..325.82 rows=80 width=18) (actual time=0.020..0.037 rows=15 loops=1)
                                                  Index Cond: ("voterId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)
                                                  Buffers: shared hit=18
                                            ->  Sort  (cost=41.72..41.75 rows=10 width=141) (actual time=0.028..0.030 rows=10 loops=1)
                                                  Sort Key: p.id
                                                  Sort Method: quicksort  Memory: 26kB
                                                  Buffers: shared hit=13
                                                  ->  Bitmap Heap Scan on "BusinessPost" p  (cost=4.52..41.56 rows=10 width=141) (actual time=0.013..0.023 rows=10 loops=1)
                                                        Recheck Cond: (("placeId" = '01a161ee-d7b7-7e66-82f7-8562f7fa9f31'::uuid) AND (status = 'VISIBLE'::"ContentStatus"))
                                                        Heap Blocks: exact=10
                                                        Buffers: shared hit=13
                                                        ->  Bitmap Index Scan on "BusinessPost_placeId_status_createdAt_id_idx"  (cost=0.00..4.51 rows=10 width=0) (actual time=0.007..0.007 rows=10 loops=1)
                                                              Index Cond: (("placeId" = '01a161ee-d7b7-7e66-82f7-8562f7fa9f31'::uuid) AND (status = 'VISIBLE'::"ContentStatus"))
                                                              Buffers: shared hit=3
                                      ->  Index Scan using "User_pkey" on "User" u  (cost=0.29..8.31 rows=1 width=30) (actual time=0.003..0.003 rows=1 loops=10)
                                            Index Cond: (id = p."authorId")
                                            Buffers: shared hit=30
                                ->  Index Scan using "Profile_pkey" on "Profile" pr  (cost=0.29..0.35 rows=1 width=37) (actual time=0.002..0.002 rows=1 loops=10)
                                      Index Cond: ("userId" = u.id)
                                      Buffers: shared hit=30
                    ->  Seq Scan on "UserBlock" b  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=10)
                          Filter: (("blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) OR ("blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid))
                    SubPlan 3
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=10)
                            ->  Seq Scan on "Photo" vc  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=10)
                                  Filter: (("businessPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'AUDIO'::"MediaKind"))
                    SubPlan 4
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=10)
                            ->  Seq Scan on "Photo" vd  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=10)
                                  Filter: (("businessPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'VIDEO'::"MediaKind"))
                    SubPlan 5
                      ->  Seq Scan on "OwnerClaim" oc  (cost=0.00..0.00 rows=1 width=0) (actual time=0.000..0.000 rows=0 loops=10)
                            Filter: (("placeId" = pl.id) AND ("userId" = p."authorId") AND (status = 'VERIFIED'::"OwnerClaimStatus"))
        SubPlan 1
          ->  Aggregate  (cost=1.07..1.08 rows=1 width=32) (actual time=0.003..0.003 rows=1 loops=10)
                ->  Sort  (cost=1.06..1.07 rows=1 width=18) (actual time=0.003..0.003 rows=0 loops=10)
                      Sort Key: a.key
                      Sort Method: quicksort  Memory: 25kB
                      ->  Hash Join  (cost=0.01..1.05 rows=1 width=18) (actual time=0.002..0.002 rows=0 loops=10)
                            Hash Cond: (a.id = ua."achievementId")
                            ->  Seq Scan on "Achievement" a  (cost=0.00..1.03 rows=3 width=34) (never executed)
                                  Filter: active
                            ->  Hash  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=10)
                                  Buckets: 1024  Batches: 1  Memory Usage: 8kB
                                  ->  Seq Scan on "UserAchievement" ua  (cost=0.00..0.00 rows=1 width=16) (actual time=0.000..0.000 rows=0 loops=10)
                                        Filter: ("userId" = p."authorId")
        SubPlan 2
          ->  Aggregate  (cost=0.02..0.03 rows=1 width=32) (actual time=0.002..0.002 rows=1 loops=10)
                ->  Sort  (cost=0.01..0.02 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=10)
                      Sort Key: ph."createdAt"
                      Sort Method: quicksort  Memory: 25kB
                      ->  Seq Scan on "Photo" ph  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=10)
                            Filter: (("businessPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'IMAGE'::"MediaKind"))
Planning:
  Buffers: shared hit=323
Planning Time: 2.182 ms
Execution Time: 0.320 ms
```

### Chat list

2.984199999998964 ms:

```sql
 SELECT c.id, c."dekWrapped", cm."lastReadAt", o.id AS other_id, o.status AS other_status, o.username, p.color, p."avatarPhotoId", l.id AS msg_id, l."bodyEnc", l."senderId", l."createdAt", (o.status = 'ACTIVE' AND EXISTS (SELECT 1 FROM "Friendship" f WHERE f."userLowId" = c."userLowId" AND f."userHighId" = c."userHighId" AND f.status = 'ACCEPTED') AND NOT EXISTS (SELECT 1 FROM "UserBlock" b WHERE (b."blockerId" = $1::uuid AND b."blockedId" = o.id) OR (b."blockerId" = o.id AND b."blockedId" = $2::uuid)) ) AS can_send FROM "ConversationMember" cm JOIN "Conversation" c ON c.id = cm."conversationId" JOIN "User" o ON o.id = CASE WHEN c."userLowId" = $3::uuid THEN c."userHighId" ELSE c."userLowId" END LEFT JOIN "Profile" p ON p."userId" = o.id JOIN LATERAL ( SELECT m.id, m."bodyEnc", m."senderId", m."createdAt" FROM "Message" m WHERE m."conversationId" = c.id AND m."unsentAt" IS NULL AND (cm."hiddenBefore" IS NULL OR m."createdAt" > cm."hiddenBefore") AND NOT EXISTS (SELECT 1 FROM "MessageHide" h WHERE h."messageId" = m.id AND h."userId" = $4::uuid) ORDER BY m."createdAt" DESC, m.id DESC LIMIT 1 ) l ON true WHERE cm."userId" = $5::uuid AND o.status <> 'DELETED' ORDER BY l."createdAt" DESC, l.id DESC
```

```
Sort  (cost=113.07..113.08 rows=4 width=262) (actual time=0.141..0.143 rows=4 loops=1)
  Sort Key: m."createdAt" DESC, m.id DESC
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=77
  ->  Nested Loop  (cost=1.85..113.03 rows=4 width=262) (actual time=0.082..0.135 rows=4 loops=1)
        Buffers: shared hit=77
        ->  Nested Loop Left Join  (cost=1.42..54.21 rows=4 width=180) (actual time=0.038..0.059 rows=4 loops=1)
              Buffers: shared hit=45
              ->  Nested Loop  (cost=1.13..52.80 rows=4 width=159) (actual time=0.035..0.051 rows=4 loops=1)
                    Buffers: shared hit=33
                    ->  Nested Loop  (cost=0.84..51.24 rows=4 width=129) (actual time=0.028..0.037 rows=4 loops=1)
                          Buffers: shared hit=21
                          ->  Index Scan using "ConversationMember_userId_idx" on "ConversationMember" cm  (cost=0.42..17.50 rows=4 width=32) (actual time=0.007..0.009 rows=4 loops=1)
                                Index Cond: ("userId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)
                                Buffers: shared hit=5
                          ->  Index Scan using "Conversation_pkey" on "Conversation" c  (cost=0.42..8.44 rows=1 width=113) (actual time=0.002..0.002 rows=1 loops=4)
                                Index Cond: (id = cm."conversationId")
                                Buffers: shared hit=16
                    ->  Index Scan using "User_pkey" on "User" o  (cost=0.29..0.39 rows=1 width=30) (actual time=0.003..0.003 rows=1 loops=4)
                          Index Cond: (id = CASE WHEN (c."userLowId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) THEN c."userHighId" ELSE c."userLowId" END)
                          Filter: (status <> 'DELETED'::"AccountStatus")
                          Buffers: shared hit=12
              ->  Index Scan using "Profile_pkey" on "Profile" p  (cost=0.29..0.35 rows=1 width=37) (actual time=0.002..0.002 rows=1 loops=4)
                    Index Cond: ("userId" = o.id)
                    Buffers: shared hit=12
        ->  Limit  (cost=0.43..6.25 rows=1 width=121) (actual time=0.011..0.012 rows=1 loops=4)
              Buffers: shared hit=16
              ->  Nested Loop Anti Join  (cost=0.43..52.81 rows=9 width=121) (actual time=0.011..0.011 rows=1 loops=4)
                    Join Filter: (h."messageId" = m.id)
                    Buffers: shared hit=16
                    ->  Index Scan using "Message_conversationId_createdAt_id_idx" on "Message" m  (cost=0.43..52.70 rows=9 width=121) (actual time=0.009..0.009 rows=1 loops=4)
                          Index Cond: ("conversationId" = c.id)
                          Filter: (("unsentAt" IS NULL) AND ((cm."hiddenBefore" IS NULL) OR ("createdAt" > cm."hiddenBefore")))
                          Buffers: shared hit=16
                    ->  Seq Scan on "MessageHide" h  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=4)
                          Filter: ("userId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)
        SubPlan 1
          ->  Index Scan using "Friendship_userLowId_userHighId_key" on "Friendship" f  (cost=0.42..8.44 rows=1 width=0) (actual time=0.005..0.005 rows=1 loops=4)
                Index Cond: (("userLowId" = c."userLowId") AND ("userHighId" = c."userHighId"))
                Filter: (status = 'ACCEPTED'::"FriendshipStatus")
                Buffers: shared hit=16
        SubPlan 2
          ->  Seq Scan on "UserBlock" b  (cost=0.00..0.00 rows=1 width=0) (actual time=0.000..0.000 rows=0 loops=4)
                Filter: ((("blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND ("blockedId" = o.id)) OR (("blockerId" = o.id) AND ("blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)))
Planning:
  Buffers: shared hit=186
Planning Time: 1.285 ms
Execution Time: 0.180 ms
```

### Unread chats badge

2.2701000000015483 ms:

```sql
 SELECT count(*)::int AS n FROM "ConversationMember" cm WHERE cm."userId" = $1::uuid AND EXISTS ( SELECT 1 FROM "Message" m WHERE m."conversationId" = cm."conversationId" AND m."senderId" <> $2::uuid AND m."unsentAt" IS NULL AND m."createdAt" > coalesce(cm."lastReadAt", 'epoch'::timestamptz) AND m."createdAt" > coalesce(cm."hiddenBefore", 'epoch'::timestamptz) AND NOT EXISTS (SELECT 1 FROM "MessageHide" h WHERE h."messageId" = m.id AND h."userId" = $3::uuid))
```

```
Aggregate  (cost=65.78..65.79 rows=1 width=4) (actual time=0.020..0.021 rows=1 loops=1)
  Buffers: shared hit=17
  ->  Nested Loop Semi Join  (cost=0.85..65.78 rows=1 width=0) (actual time=0.019..0.019 rows=0 loops=1)
        Buffers: shared hit=17
        ->  Index Scan using "ConversationMember_userId_idx" on "ConversationMember" cm  (cost=0.42..17.50 rows=4 width=32) (actual time=0.005..0.007 rows=4 loops=1)
              Index Cond: ("userId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)
              Buffers: shared hit=5
        ->  Nested Loop Anti Join  (cost=0.43..12.04 rows=3 width=24) (actual time=0.003..0.003 rows=0 loops=4)
              Join Filter: (h."messageId" = m.id)
              Buffers: shared hit=12
              ->  Index Scan using "Message_conversationId_createdAt_id_idx" on "Message" m  (cost=0.43..12.00 rows=3 width=40) (actual time=0.002..0.002 rows=0 loops=4)
                    Index Cond: (("conversationId" = cm."conversationId") AND ("createdAt" > COALESCE(cm."lastReadAt", '1970-01-01 00:00:00+00'::timestamp with time zone)) AND ("createdAt" > COALESCE(cm."hiddenBefore", '1970-01-01 00:00:00+00'::timestamp with time zone)))
                    Filter: (("unsentAt" IS NULL) AND ("senderId" <> '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid))
                    Buffers: shared hit=12
              ->  Seq Scan on "MessageHide" h  (cost=0.00..0.00 rows=1 width=16) (never executed)
                    Filter: ("userId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)
Planning:
  Buffers: shared hit=23
Planning Time: 0.233 ms
Execution Time: 0.043 ms
```

### Notification badge

1.2867000000005646 ms:

```sql
SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."Notification"."id" FROM "public"."Notification" LEFT JOIN "public"."User" AS "j0" ON ("j0"."id") = ("public"."Notification"."actorId") WHERE ("public"."Notification"."userId" = $1 AND "public"."Notification"."readAt" IS NULL AND ("j0"."status" = CAST($2::text AS "public"."AccountStatus") AND ("j0"."id" IS NOT NULL)) AND "public"."Notification"."createdAt" > $3) OFFSET $4) AS "sub"
```

```
Aggregate  (cost=65.74..65.75 rows=1 width=8) (actual time=0.033..0.034 rows=1 loops=1)
  Buffers: shared hit=23
  ->  Nested Loop  (cost=4.75..65.67 rows=5 width=16) (actual time=0.019..0.031 rows=5 loops=1)
        Buffers: shared hit=23
        ->  Bitmap Heap Scan on "Notification"  (cost=4.46..24.10 rows=5 width=16) (actual time=0.014..0.020 rows=5 loops=1)
              Recheck Cond: (("userId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND ("readAt" IS NULL))
              Filter: ("createdAt" > '2026-09-22 04:55:15.065+00'::timestamp with time zone)
              Heap Blocks: exact=5
              Buffers: shared hit=8
              ->  Bitmap Index Scan on "Notification_userId_idx"  (cost=0.00..4.46 rows=5 width=0) (actual time=0.010..0.010 rows=5 loops=1)
                    Index Cond: ("userId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)
                    Buffers: shared hit=3
        ->  Index Scan using "User_pkey" on "User" j0  (cost=0.29..8.31 rows=1 width=16) (actual time=0.002..0.002 rows=1 loops=5)
              Index Cond: (id = "Notification"."actorId")
              Filter: (status = ('ACTIVE'::cstring)::"AccountStatus")
              Buffers: shared hit=15
Planning:
  Buffers: shared hit=32
Planning Time: 0.511 ms
Execution Time: 0.059 ms
```

### Notification list

3.5943000000006577 ms:

```sql
SELECT "public"."Notification"."id", "public"."Notification"."userId", "public"."Notification"."type"::text, "public"."Notification"."actorId", "public"."Notification"."createdAt", "public"."Notification"."readAt" FROM "public"."Notification" LEFT JOIN "public"."User" AS "j0" ON ("j0"."id") = ("public"."Notification"."actorId") WHERE ("public"."Notification"."userId" = $1 AND ("j0"."status" = CAST($2::text AS "public"."AccountStatus") AND ("j0"."id" IS NOT NULL)) AND "public"."Notification"."createdAt" > $3) ORDER BY "public"."Notification"."createdAt" DESC LIMIT $4 OFFSET $5
```

```
Limit  (cost=0.71..127.62 rows=10 width=96) (actual time=0.048..0.073 rows=10 loops=1)
  Buffers: shared hit=46
  ->  Nested Loop  (cost=0.71..127.62 rows=10 width=96) (actual time=0.047..0.071 rows=10 loops=1)
        Buffers: shared hit=46
        ->  Index Scan Backward using "Notification_userId_createdAt_idx" on "Notification"  (cost=0.42..44.42 rows=10 width=68) (actual time=0.018..0.027 rows=10 loops=1)
              Index Cond: (("userId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND ("createdAt" > '2026-09-22 04:55:15.142+00'::timestamp with time zone))
              Buffers: shared hit=14
        ->  Index Scan using "User_pkey" on "User" j0  (cost=0.29..8.31 rows=1 width=16) (actual time=0.002..0.002 rows=1 loops=10)
              Index Cond: (id = "Notification"."actorId")
              Filter: (status = ('ACTIVE'::cstring)::"AccountStatus")
              Buffers: shared hit=30
Planning:
  Buffers: shared hit=17
Planning Time: 0.230 ms
Execution Time: 0.092 ms
```

2.7576999999982945 ms:

```sql
SELECT "public"."Profile"."userId", "public"."Profile"."color", "public"."Profile"."bio", "public"."Profile"."avatarPhotoId", "public"."Profile"."updatedAt" FROM "public"."Profile" WHERE "public"."Profile"."userId" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) OFFSET $11
```

```
Index Scan using "Profile_pkey" on "Profile"  (cost=0.29..47.08 rows=10 width=561) (actual time=0.008..0.011 rows=10 loops=1)
  Index Cond: ("userId" = ANY ('{01a161ee-cac0-70cd-a194-897fe0364abc,01a161ee-cac0-71b6-b952-514c009e0d6b,01a161ee-cac0-7207-a4b9-df5698311cb9,01a161ee-cac0-7216-bdd8-cdc29435a04d,01a161ee-cac0-7225-b815-1834d46f5d8f,01a161ee-cac0-7251-9261-c1c9f1af8f78,01a161ee-cac0-72aa-a27e-8958c85a9642,01a161ee-cac0-72f9-ac26-7d8c76e2d2a4,01a161ee-cac0-7373-88ce-5868b5b7998d,01a161ee-cac0-737e-b4c3-1f3e0902bfb5}'::uuid[]))
  Buffers: shared hit=3
Planning:
  Buffers: shared hit=9
Planning Time: 0.071 ms
Execution Time: 0.020 ms
```

### Friends feed

3.6821000000018103 ms:

```sql
 SELECT * FROM ( SELECT p.id, 'general' AS kind, p."createdAt" AS created_at, ST_Y(p.location::geometry) AS latitude, ST_X(p.location::geometry) AS longitude, NULL::uuid AS place_id, NULL AS place_name, p."authorId" AS author_id FROM "GeneralPost" p WHERE p.status = 'VISIBLE' AND p."authorId" IN (SELECT u.id FROM "User" u WHERE u.id IN ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::uuid,$12::uuid,$13::uuid,$14::uuid,$15::uuid,$16::uuid,$17::uuid,$18::uuid,$19::uuid,$20::uuid) AND u.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM "UserSettings" s WHERE s."userId" = u.id AND s."hidePostsFromFriends") AND NOT EXISTS (SELECT 1 FROM "UserBlock" b WHERE (b."blockerId" = u.id AND b."blockedId" = $21::uuid) OR (b."blockerId" = $22::uuid AND b."blockedId" = u.id))) AND p."createdAt" > now() - make_interval(days => $23::int) UNION ALL SELECT p.id, 'business', p."createdAt", NULL, NULL, pl.id, pl.name, p."authorId" FROM "BusinessPost" p JOIN "BusinessPlace" pl ON pl.id = p."placeId" WHERE p.status = 'VISIBLE' AND pl.status = 'ACTIVE' AND p."authorId" IN (SELECT u.id FROM "User" u WHERE u.id IN ($24::uuid,$25::uuid,$26::uuid,$27::uuid,$28::uuid,$29::uuid,$30::uuid,$31::uuid,$32::uuid,$33::uuid,$34::uuid,$35::uuid,$36::uuid,$37::uuid,$38::uuid,$39::uuid,$40::uuid,$41::uuid,$42::uuid,$43::uuid) AND u.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM "UserSettings" s WHERE s."userId" = u.id AND s."hidePostsFromFriends") AND NOT EXISTS (SELECT
```

```
Limit  (cost=518.50..518.51 rows=4 width=132) (actual time=0.254..0.257 rows=6 loops=1)
  Buffers: shared hit=126
  ->  Sort  (cost=518.50..518.51 rows=4 width=132) (actual time=0.253..0.256 rows=6 loops=1)
        Sort Key: p."createdAt" DESC, p.id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=126
        ->  Append  (cost=91.33..518.46 rows=4 width=132) (actual time=0.077..0.248 rows=6 loops=1)
              Buffers: shared hit=126
              ->  Nested Loop  (cost=91.33..260.28 rows=3 width=136) (actual time=0.076..0.144 rows=4 loops=1)
                    Buffers: shared hit=71
                    ->  HashAggregate  (cost=90.90..91.10 rows=20 width=16) (actual time=0.064..0.079 rows=20 loops=1)
                          Group Key: u.id
                          Batches: 1  Memory Usage: 24kB
                          Buffers: shared hit=7
                          ->  Nested Loop Anti Join  (cost=0.29..90.85 rows=20 width=16) (actual time=0.016..0.058 rows=20 loops=1)
                                Join Filter: (((b."blockerId" = u.id) AND (b."blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)) OR ((b."blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND (b."blockedId" = u.id)))
                                Buffers: shared hit=7
                                ->  Nested Loop Anti Join  (cost=0.29..90.45 rows=20 width=16) (actual time=0.015..0.040 rows=20 loops=1)
                                      Join Filter: (s."userId" = u.id)
                                      Buffers: shared hit=7
                                      ->  Index Scan using "User_pkey" on "User" u  (cost=0.29..90.20 rows=20 width=16) (actual time=0.009..0.017 rows=20 loops=1)
                                            Index Cond: (id = ANY ('{01a161ee-cac0-7067-ad29-84ce13af5995,01a161ee-d329-7fa2-952d-9dfb06463eeb,01a161ee-cac0-70cd-a194-897fe0364abc,01a161ee-d329-7f75-9684-d3573bb4e656,01a161ee-cac0-71b6-b952-514c009e0d6b,01a161ee-d329-7dc8-ae95-9b8b9dad5e7a,01a161ee-cac0-7207-a4b9-df5698311cb9,01a161ee-d329-7cd3-adb3-1440d63c4e31,01a161ee-cac0-7216-bdd8-cdc29435a04d,01a161ee-d329-7c0d-8e5e-2561eebfb385,01a161ee-cac0-7225-b815-1834d46f5d8f,01a161ee-d329-79a0-8b8a-f821ae1af6ac,01a161ee-cac0-7251-9261-c1c9f1af8f78,01a161ee-d329-771f-a8ad-0f14626e5d10,01a161ee-cac0-72aa-a27e-8958c85a9642,01a161ee-d329-7708-b088-06751708e361,01a161ee-cac0-72f9-ac26-7d8c76e2d2a4,01a161ee-d329-76a9-ac6b-750b630c77cc,01a161ee-cac0-7373-88ce-5868b5b7998d,01a161ee-d329-765a-9ada-4ab8d1a7f17d}'::uuid[]))
                                            Filter: (status = 'ACTIVE'::"AccountStatus")
                                            Buffers: shared hit=7
                                      ->  Seq Scan on "UserSettings" s  (cost=0.00..0.00 rows=1 width=16) (actual time=0.000..0.000 rows=0 loops=20)
                                            Filter: "hidePostsFromFriends"
                                ->  Seq Scan on "UserBlock" b  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=20)
                                      Filter: (("blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) OR ("blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid))
                    ->  Index Scan using "GeneralPost_authorId_createdAt_idx" on "GeneralPost" p  (cost=0.42..8.45 rows=1 width=72) (actual time=0.002..0.002 rows=0 loops=20)
                          Index Cond: (("authorId" = u.id) AND ("createdAt" > (now() - '3 days'::interval)))
                          Filter: (status = 'VISIBLE'::"ContentStatus")
                          Buffers: shared hit=64
              ->  Nested Loop  (cost=91.48..258.16 rows=1 width=119) (actual time=0.087..0.102 rows=2 loops=1)
                    Buffers: shared hit=55
                    ->  Nested Loop  (cost=91.20..257.65 rows=1 width=56) (actual time=0.082..0.094 rows=2 loops=1)
                          Buffers: shared hit=49
                          ->  HashAggregate  (cost=90.90..91.10 rows=20 width=16) (actual time=0.055..0.057 rows=20 loops=1)
                                Group Key: u_1.id
                                Batches: 1  Memory Usage: 24kB
                                Buffers: shared hit=7
                                ->  Nested Loop Anti Join  (cost=0.29..90.85 rows=20 width=16) (actual time=0.011..0.052 rows=20 loops=1)
                                      Join Filter: (((b_1."blockerId" = u_1.id) AND (b_1."blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)) OR ((b_1."blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND (b_1."blockedId" = u_1.id)))
                                      Buffers: shared hit=7
                                      ->  Nested Loop Anti Join  (cost=0.29..90.45 rows=20 width=16) (actual time=0.009..0.032 rows=20 loops=1)
                                            Join Filter: (s_1."userId" = u_1.id)
                                            Buffers: shared hit=7
                                            ->  Index Scan using "User_pkey" on "User" u_1  (cost=0.29..90.20 rows=20 width=16) (actual time=0.007..0.013 rows=20 loops=1)
                                                  Index Cond: (id = ANY ('{01a161ee-cac0-7067-ad29-84ce13af5995,01a161ee-d329-7fa2-952d-9dfb06463eeb,01a161ee-cac0-70cd-a194-897fe0364abc,01a161ee-d329-7f75-9684-d3573bb4e656,01a161ee-cac0-71b6-b952-514c009e0d6b,01a161ee-d329-7dc8-ae95-9b8b9dad5e7a,01a161ee-cac0-7207-a4b9-df5698311cb9,01a161ee-d329-7cd3-adb3-1440d63c4e31,01a161ee-cac0-7216-bdd8-cdc29435a04d,01a161ee-d329-7c0d-8e5e-2561eebfb385,01a161ee-cac0-7225-b815-1834d46f5d8f,01a161ee-d329-79a0-8b8a-f821ae1af6ac,01a161ee-cac0-7251-9261-c1c9f1af8f78,01a161ee-d329-771f-a8ad-0f14626e5d10,01a161ee-cac0-72aa-a27e-8958c85a9642,01a161ee-d329-7708-b088-06751708e361,01a161ee-cac0-72f9-ac26-7d8c76e2d2a4,01a161ee-d329-76a9-ac6b-750b630c77cc,01a161ee-cac0-7373-88ce-5868b5b7998d,01a161ee-d329-765a-9ada-4ab8d1a7f17d}'::uuid[]))
                                                  Filter: (status = 'ACTIVE'::"AccountStatus")
                                                  Buffers: shared hit=7
                                            ->  Seq Scan on "UserSettings" s_1  (cost=0.00..0.00 rows=1 width=16) (actual time=0.000..0.000 rows=0 loops=20)
                                                  Filter: "hidePostsFromFriends"
                                      ->  Seq Scan on "UserBlock" b_1  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=20)
                                            Filter: (("blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) OR ("blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid))
                          ->  Index Scan using "BusinessPost_authorId_createdAt_idx" on "BusinessPost" p_1  (cost=0.29..8.32 rows=1 width=56) (actual time=0.001..0.001 rows=0 loops=20)
                                Index Cond: (("authorId" = u_1.id) AND ("createdAt" > (now() - '3 days'::interval)))
                                Filter: (status = 'VISIBLE'::"ContentStatus")
                                Buffers: shared hit=42
                    ->  Index Scan using "BusinessPlace_pkey" on "BusinessPlace" pl  (cost=0.28..0.51 rows=1 width=31) (actual time=0.003..0.003 rows=1 loops=2)
                          Index Cond: (id = p_1."placeId")
                          Filter: (status = 'ACTIVE'::"PlaceStatus")
                          Buffers: shared hit=6
Planning:
  Buffers: shared hit=75
Planning Time: 0.856 ms
Execution Time: 0.362 ms
```

1.1693999999988591 ms:

```sql
SELECT "public"."Friendship"."id", "public"."Friendship"."userLowId", "public"."Friendship"."userHighId" FROM "public"."Friendship" WHERE ("public"."Friendship"."status" = CAST($1::text AS "public"."FriendshipStatus") AND ("public"."Friendship"."userLowId" = $2 OR "public"."Friendship"."userHighId" = $3)) OFFSET $4
```

```
Bitmap Heap Scan on "Friendship"  (cost=9.04..86.31 rows=20 width=48) (actual time=0.025..0.045 rows=20 loops=1)
  Recheck Cond: (("userLowId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) OR (("userHighId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND (status = ('ACCEPTED'::cstring)::"FriendshipStatus")))
  Filter: (status = ('ACCEPTED'::cstring)::"FriendshipStatus")
  Heap Blocks: exact=12
  Buffers: shared hit=18
  ->  BitmapOr  (cost=9.04..9.04 rows=20 width=0) (actual time=0.018..0.019 rows=0 loops=1)
        Buffers: shared hit=6
        ->  Bitmap Index Scan on "Friendship_userLowId_userHighId_key"  (cost=0.00..4.50 rows=10 width=0) (actual time=0.005..0.005 rows=20 loops=1)
              Index Cond: ("userLowId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)
              Buffers: shared hit=3
        ->  Bitmap Index Scan on "Friendship_userHighId_status_idx"  (cost=0.00..4.53 rows=10 width=0) (actual time=0.013..0.013 rows=0 loops=1)
              Index Cond: (("userHighId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND (status = ('ACCEPTED'::cstring)::"FriendshipStatus"))
              Buffers: shared hit=3
Planning:
  Buffers: shared hit=3
Planning Time: 0.069 ms
Execution Time: 0.064 ms
```

### Places near you

2.123599999998987 ms:

```sql
 SELECT p.id, p.name, p.category, p.address, p.latitude, p.longitude, p."postCount" AS post_count, (SELECT count(*)::int FROM "FavoritePlace" fc WHERE fc."placeId" = p.id) AS favorite_count, ST_Distance(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance, (f."userId" IS NOT NULL) AS is_favorite FROM "BusinessPlace" p LEFT JOIN "FavoritePlace" f ON f."placeId" = p.id AND f."userId" = $3::uuid WHERE p.status = 'ACTIVE' -- D69: only places within a mile, and only names that fit on one line. AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6) AND char_length(p.name) <= $7 ORDER BY ST_Distance(p.location, ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography) * CASE WHEN f."userId" IS NULL THEN 1.0 ELSE $10::float8 END ASC, p.id LIMIT $11 OFFSET $12
```

```
Limit  (cost=141.82..166.85 rows=1 width=594) (actual time=0.106..0.115 rows=7 loops=1)
  Buffers: shared hit=15
  ->  Result  (cost=141.82..166.85 rows=1 width=594) (actual time=0.105..0.114 rows=7 loops=1)
        Buffers: shared hit=15
        ->  Sort  (cost=141.82..141.82 rows=1 width=618) (actual time=0.103..0.104 rows=7 loops=1)
              Sort Key: ((st_distance(p.location, '0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, true) * CASE WHEN (f."userId" IS NULL) THEN '1'::double precision ELSE '0.25'::double precision END)), p.id
              Sort Method: quicksort  Memory: 26kB
              Buffers: shared hit=15
              ->  Nested Loop Left Join  (cost=4.33..141.81 rows=1 width=618) (actual time=0.044..0.089 rows=7 loops=1)
                    Join Filter: (f."placeId" = p.id)
                    Buffers: shared hit=12
                    ->  Bitmap Heap Scan on "BusinessPlace" p  (cost=4.33..129.28 rows=1 width=605) (actual time=0.027..0.050 rows=7 loops=1)
                          Filter: ((status = 'ACTIVE'::"PlaceStatus") AND (char_length((name)::text) <= 30) AND st_dwithin(location, '0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, '482.8032'::double precision, true))
                          Rows Removed by Filter: 4
                          Heap Blocks: exact=10
                          Buffers: shared hit=12
                          ->  Bitmap Index Scan on "BusinessPlace_location_idx"  (cost=0.00..4.33 rows=8 width=0) (actual time=0.015..0.015 rows=11 loops=1)
                                Index Cond: (location && _st_expand('0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, '482.8032'::double precision))
                                Buffers: shared hit=2
                    ->  Seq Scan on "FavoritePlace" f  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=7)
                          Filter: ("userId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)
                    SubPlan 1
                      ->  Aggregate  (cost=0.00..0.02 rows=1 width=4) (actual time=0.001..0.001 rows=1 loops=7)
                            ->  Seq Scan on "FavoritePlace" fc  (cost=0.00..0.00 rows=1 width=0) (actual time=0.000..0.000 rows=0 loops=7)
                                  Filter: ("placeId" = p.id)
Planning:
  Buffers: shared hit=84
Planning Time: 0.479 ms
Execution Time: 0.149 ms
```

### Places search by name

4.981100000000879 ms:

```sql
 SELECT p.id, p.name, p.category, p.address, p.latitude, p.longitude, p."postCount" AS post_count, (SELECT count(*)::int FROM "FavoritePlace" fc WHERE fc."placeId" = p.id) AS favorite_count, ST_Distance(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance, (f."userId" IS NOT NULL) AS is_favorite FROM "BusinessPlace" p LEFT JOIN "FavoritePlace" f ON f."placeId" = p.id AND f."userId" = $3::uuid WHERE p.status = 'ACTIVE' AND (p."nameNormalized" % $4::text OR p."nameNormalized" LIKE $5::text) -- D69: only places within a mile, and only names that fit on one line. AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8) AND char_length(p.name) <= $9 ORDER BY round(similarity(p."nameNormalized", $10::text)::numeric, 1) DESC, ST_Distance(p.location, ST_SetSRID(ST_MakePoint($11, $12), 4326)::geography) * CASE WHEN f."userId" IS NULL THEN 1.0 ELSE $13::float8 END ASC, p.id LIMIT $14 OFFSET $15
```

```
Limit  (cost=141.86..166.90 rows=1 width=626) (actual time=1.432..1.454 rows=7 loops=1)
  Buffers: shared hit=15
  ->  Result  (cost=141.86..166.90 rows=1 width=626) (actual time=1.431..1.451 rows=7 loops=1)
        Buffers: shared hit=15
        ->  Sort  (cost=141.86..141.87 rows=1 width=650) (actual time=1.425..1.428 rows=7 loops=1)
              Sort Key: (round((similarity((p."nameNormalized")::text, 'load place 12'::text))::numeric, 1)) DESC, ((st_distance(p.location, '0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, true) * CASE WHEN (f."userId" IS NULL) THEN '1'::double precision ELSE '0.25'::double precision END)), p.id
              Sort Method: quicksort  Memory: 26kB
              Buffers: shared hit=15
              ->  Nested Loop Left Join  (cost=4.33..141.85 rows=1 width=650) (actual time=0.057..1.403 rows=7 loops=1)
                    Join Filter: (f."placeId" = p.id)
                    Buffers: shared hit=12
                    ->  Bitmap Heap Scan on "BusinessPlace" p  (cost=4.33..129.32 rows=1 width=620) (actual time=0.031..1.243 rows=7 loops=1)
                          Filter: ((status = 'ACTIVE'::"PlaceStatus") AND ((("nameNormalized")::text % 'load place 12'::text) OR (("nameNormalized")::text ~~ '%load place 12%'::text)) AND (char_length((name)::text) <= 30) AND st_dwithin(location, '0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, '482.8032'::double precision, true))
                          Rows Removed by Filter: 4
                          Heap Blocks: exact=10
                          Buffers: shared hit=12
                          ->  Bitmap Index Scan on "BusinessPlace_location_idx"  (cost=0.00..4.33 rows=8 width=0) (actual time=0.015..0.016 rows=11 loops=1)
                                Index Cond: (location && _st_expand('0101000020E61000007B14AE47E16A54C052B81E85EB513E40'::geography, '482.8032'::double precision))
                                Buffers: shared hit=2
                    ->  Seq Scan on "FavoritePlace" f  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=7)
                          Filter: ("userId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)
                    SubPlan 1
                      ->  Aggregate  (cost=0.00..0.02 rows=1 width=4) (actual time=0.002..0.002 rows=1 loops=7)
                            ->  Seq Scan on "FavoritePlace" fc  (cost=0.00..0.00 rows=1 width=0) (actual time=0.000..0.000 rows=0 loops=7)
                                  Filter: ("placeId" = p.id)
Planning:
  Buffers: shared hit=31
Planning Time: 0.984 ms
Execution Time: 1.506 ms
```

### Profile: their posts

3.8621000000021013 ms:

```sql
 SELECT p.id, p.body, p."createdAt", p."editedAt", p.score, p."upCount", p."downCount", p."commentCount", p."authorId", u.username, u.status::text AS author_status, coalesce(pr.color, 'teal') AS author_color, pr."avatarPhotoId" AS avatar_photo_id, COALESCE((SELECT array_agg(a.key ORDER BY a.key) FROM "UserAchievement" ua JOIN "Achievement" a ON a.id = ua."achievementId" WHERE ua."userId" = p."authorId" AND a.active), '{}'::varchar[]) AS medals, (SELECT json_agg(json_build_object('id', ph.id, 'width', ph.width, 'height', ph.height) ORDER BY ph."createdAt") FROM "Photo" ph WHERE ph."generalPostId" = p.id AND ph.status = 'ACTIVE' AND ph.kind = 'IMAGE') AS photos, (SELECT json_build_object('id', vc.id, 'durationMs', vc."durationMs") FROM "Photo" vc WHERE vc."generalPostId" = p.id AND vc.status = 'ACTIVE' AND vc.kind = 'AUDIO' LIMIT 1) AS voice, (SELECT json_build_object('id', vd.id, 'durationMs', vd."durationMs", 'width', vd.width, 'height', vd.height) FROM "Photo" vd WHERE vd."generalPostId" = p.id AND vd.status = 'ACTIVE' AND vd.kind = 'VIDEO' LIMIT 1) AS video, v.value AS my_vote, ST_Distance(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance, NULL::uuid AS place_id, NULL::text AS place_name, false AS is_owner FROM "GeneralPost" p JOIN "User" u ON u.id = p."authorId" LEFT JOIN "Profile" pr ON pr."userId" = u.id LEFT JOIN "Vote" v ON v."generalPostId" = p.id AND v."voterId" = $3::uuid WHERE p.status = 'VISIBLE' AND p."authorId" = $4::uuid AND NOT EXISTS
```

```
Limit  (cost=20.56..99.82 rows=3 width=399) (actual time=0.106..0.132 rows=4 loops=1)
  Buffers: shared hit=28
  ->  Result  (cost=20.56..99.82 rows=3 width=399) (actual time=0.105..0.131 rows=4 loops=1)
        Buffers: shared hit=28
        ->  Incremental Sort  (cost=20.56..58.92 rows=3 width=359) (actual time=0.078..0.079 rows=4 loops=1)
              Sort Key: p."createdAt" DESC, p.id DESC
              Presorted Key: p."createdAt"
              Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 26kB  Peak Memory: 26kB
              Buffers: shared hit=28
              ->  Nested Loop Anti Join  (cost=1.43..58.78 rows=3 width=359) (actual time=0.035..0.059 rows=4 loops=1)
                    Join Filter: (((b."blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND (b."blockedId" = p."authorId")) OR ((b."blockerId" = p."authorId") AND (b."blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid)))
                    Buffers: shared hit=25
                    ->  Nested Loop Left Join  (cost=1.43..58.69 rows=3 width=191) (actual time=0.025..0.038 rows=4 loops=1)
                          Buffers: shared hit=25
                          ->  Nested Loop  (cost=1.00..33.14 rows=3 width=189) (actual time=0.019..0.027 rows=4 loops=1)
                                Buffers: shared hit=13
                                ->  Index Scan using "GeneralPost_authorId_createdAt_idx" on "GeneralPost" p  (cost=0.42..16.48 rows=3 width=154) (actual time=0.008..0.012 rows=4 loops=1)
                                      Index Cond: ("authorId" = '01a161ee-cb46-7421-95a5-eb9953bddfdf'::uuid)
                                      Filter: (status = 'VISIBLE'::"ContentStatus")
                                      Buffers: shared hit=7
                                ->  Materialize  (cost=0.58..16.63 rows=1 width=51) (actual time=0.003..0.003 rows=1 loops=4)
                                      Buffers: shared hit=6
                                      ->  Nested Loop Left Join  (cost=0.58..16.62 rows=1 width=51) (actual time=0.009..0.010 rows=1 loops=1)
                                            Buffers: shared hit=6
                                            ->  Index Scan using "User_pkey" on "User" u  (cost=0.29..8.31 rows=1 width=30) (actual time=0.005..0.005 rows=1 loops=1)
                                                  Index Cond: (id = '01a161ee-cb46-7421-95a5-eb9953bddfdf'::uuid)
                                                  Buffers: shared hit=3
                                            ->  Index Scan using "Profile_pkey" on "Profile" pr  (cost=0.29..8.31 rows=1 width=37) (actual time=0.004..0.004 rows=1 loops=1)
                                                  Index Cond: ("userId" = '01a161ee-cb46-7421-95a5-eb9953bddfdf'::uuid)
                                                  Buffers: shared hit=3
                          ->  Index Scan using "Vote_voterId_generalPostId_key" on "Vote" v  (cost=0.43..8.45 rows=1 width=18) (actual time=0.002..0.002 rows=0 loops=4)
                                Index Cond: (("voterId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) AND ("generalPostId" = p.id))
                                Buffers: shared hit=12
                    ->  Seq Scan on "UserBlock" b  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=4)
                          Filter: (("blockerId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid) OR ("blockedId" = '01a161ee-cabc-7ff6-a83a-93297e0e49c0'::uuid))
                    SubPlan 3
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=4)
                            ->  Seq Scan on "Photo" vc  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=4)
                                  Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'AUDIO'::"MediaKind"))
                    SubPlan 4
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=4)
                            ->  Seq Scan on "Photo" vd  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=4)
                                  Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'VIDEO'::"MediaKind"))
        SubPlan 1
          ->  Aggregate  (cost=1.07..1.08 rows=1 width=32) (actual time=0.004..0.004 rows=1 loops=4)
                ->  Sort  (cost=1.06..1.07 rows=1 width=18) (actual time=0.004..0.004 rows=0 loops=4)
                      Sort Key: a.key
                      Sort Method: quicksort  Memory: 25kB
                      ->  Hash Join  (cost=0.01..1.05 rows=1 width=18) (actual time=0.002..0.002 rows=0 loops=4)
                            Hash Cond: (a.id = ua."achievementId")
                            ->  Seq Scan on "Achievement" a  (cost=0.00..1.03 rows=3 width=34) (never executed)
                                  Filter: active
                            ->  Hash  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=4)
                                  Buckets: 1024  Batches: 1  Memory Usage: 8kB
                                  ->  Seq Scan on "UserAchievement" ua  (cost=0.00..0.00 rows=1 width=16) (actual time=0.000..0.000 rows=0 loops=4)
                                        Filter: ("userId" = p."authorId")
        SubPlan 2
          ->  Aggregate  (cost=0.02..0.03 rows=1 width=32) (actual time=0.002..0.002 rows=1 loops=4)
                ->  Sort  (cost=0.01..0.02 rows=1 width=32) (actual time=0.002..0.002 rows=0 loops=4)
                      Sort Key: ph."createdAt"
                      Sort Method: quicksort  Memory: 25kB
                      ->  Seq Scan on "Photo" ph  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=4)
                            Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'IMAGE'::"MediaKind"))
Planning:
  Buffers: shared hit=61
Planning Time: 0.751 ms
Execution Time: 0.194 ms
```

### Profile: your posts

9.391700000000128 ms:

```sql
 SELECT p.id, p.body, p."createdAt", p."editedAt", p.score, p."upCount", p."downCount", p."commentCount", p."authorId", u.username, u.status::text AS author_status, coalesce(pr.color, 'teal') AS author_color, pr."avatarPhotoId" AS avatar_photo_id, COALESCE((SELECT array_agg(a.key ORDER BY a.key) FROM "UserAchievement" ua JOIN "Achievement" a ON a.id = ua."achievementId" WHERE ua."userId" = p."authorId" AND a.active), '{}'::varchar[]) AS medals, (SELECT json_agg(json_build_object('id', ph.id, 'width', ph.width, 'height', ph.height) ORDER BY ph."createdAt") FROM "Photo" ph WHERE ph."businessPostId" = p.id AND ph.status = 'ACTIVE' AND ph.kind = 'IMAGE') AS photos, (SELECT json_build_object('id', vc.id, 'durationMs', vc."durationMs") FROM "Photo" vc WHERE vc."businessPostId" = p.id AND vc.status = 'ACTIVE' AND vc.kind = 'AUDIO' LIMIT 1) AS voice, (SELECT json_build_object('id', vd.id, 'durationMs', vd."durationMs", 'width', vd.width, 'height', vd.height) FROM "Photo" vd WHERE vd."businessPostId" = p.id AND vd.status = 'ACTIVE' AND vd.kind = 'VIDEO' LIMIT 1) AS video, v.value AS my_vote, NULL::float8 AS distance, pl.id AS place_id, pl.name AS place_name, EXISTS (SELECT 1 FROM "OwnerClaim" oc WHERE oc."placeId" = pl.id AND oc."userId" = p."authorId" AND oc.status = 'VERIFIED') AS is_owner FROM "BusinessPost" p JOIN "User" u ON u.id = p."authorId" LEFT JOIN "Profile" pr ON pr."userId" = u.id JOIN "BusinessPlace" pl ON pl.id = p."placeId" LEFT JOIN "Vote" v ON v."businessPostId" = p.
```

```
Limit  (cost=41.91..44.23 rows=2 width=385) (actual time=0.013..0.014 rows=0 loops=1)
  Buffers: shared hit=2
  ->  Result  (cost=41.91..44.23 rows=2 width=385) (actual time=0.012..0.013 rows=0 loops=1)
        Buffers: shared hit=2
        ->  Incremental Sort  (cost=41.91..41.96 rows=2 width=321) (actual time=0.012..0.013 rows=0 loops=1)
              Sort Key: p."createdAt" DESC, p.id DESC
              Presorted Key: p."createdAt"
              Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 25kB  Peak Memory: 25kB
              Buffers: shared hit=2
              ->  Nested Loop Left Join  (cost=1.58..41.90 rows=1 width=321) (actual time=0.008..0.008 rows=0 loops=1)
                    Buffers: shared hit=2
                    ->  Nested Loop  (cost=1.15..33.25 rows=1 width=191) (actual time=0.007..0.008 rows=0 loops=1)
                          Buffers: shared hit=2
                          ->  Nested Loop Left Join  (cost=0.87..24.95 rows=1 width=176) (actual time=0.007..0.008 rows=0 loops=1)
                                Buffers: shared hit=2
                                ->  Nested Loop  (cost=0.58..16.63 rows=1 width=171) (actual time=0.007..0.007 rows=0 loops=1)
                                      Buffers: shared hit=2
                                      ->  Index Scan using "BusinessPost_authorId_createdAt_idx" on "BusinessPost" p  (cost=0.29..8.31 rows=1 width=141) (actual time=0.007..0.007 rows=0 loops=1)
                                            Index Cond: ("authorId" = '01a161ee-cb46-7421-95a5-eb9953bddfdf'::uuid)
                                            Filter: (status = 'VISIBLE'::"ContentStatus")
                                            Buffers: shared hit=2
                                      ->  Index Scan using "User_pkey" on "User" u  (cost=0.29..8.31 rows=1 width=30) (never executed)
                                            Index Cond: (id = '01a161ee-cb46-7421-95a5-eb9953bddfdf'::uuid)
                                ->  Index Scan using "Profile_pkey" on "Profile" pr  (cost=0.29..8.31 rows=1 width=37) (never executed)
                                      Index Cond: ("userId" = '01a161ee-cb46-7421-95a5-eb9953bddfdf'::uuid)
                          ->  Index Scan using "BusinessPlace_pkey" on "BusinessPlace" pl  (cost=0.28..8.30 rows=1 width=31) (never executed)
                                Index Cond: (id = p."placeId")
                    ->  Index Scan using "Vote_voterId_businessPostId_key" on "Vote" v  (cost=0.43..8.45 rows=1 width=18) (never executed)
                          Index Cond: (("voterId" = '01a161ee-cb46-7421-95a5-eb9953bddfdf'::uuid) AND ("businessPostId" = p.id))
                    SubPlan 3
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (never executed)
                            ->  Seq Scan on "Photo" vc  (cost=0.00..0.00 rows=1 width=32) (never executed)
                                  Filter: (("businessPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'AUDIO'::"MediaKind"))
                    SubPlan 4
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (never executed)
                            ->  Seq Scan on "Photo" vd  (cost=0.00..0.00 rows=1 width=32) (never executed)
                                  Filter: (("businessPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'VIDEO'::"MediaKind"))
                    SubPlan 5
                      ->  Seq Scan on "OwnerClaim" oc  (cost=0.00..0.00 rows=1 width=0) (never executed)
                            Filter: (("placeId" = pl.id) AND ("userId" = p."authorId") AND (status = 'VERIFIED'::"OwnerClaimStatus"))
        SubPlan 1
          ->  Aggregate  (cost=1.07..1.08 rows=1 width=32) (never executed)
                ->  Sort  (cost=1.06..1.07 rows=1 width=18) (never executed)
                      Sort Key: a.key
                      ->  Hash Join  (cost=0.01..1.05 rows=1 width=18) (never executed)
                            Hash Cond: (a.id = ua."achievementId")
                            ->  Seq Scan on "Achievement" a  (cost=0.00..1.03 rows=3 width=34) (never executed)
                                  Filter: active
                            ->  Hash  (cost=0.00..0.00 rows=1 width=16) (never executed)
                                  ->  Seq Scan on "UserAchievement" ua  (cost=0.00..0.00 rows=1 width=16) (never executed)
                                        Filter: ("userId" = p."authorId")
        SubPlan 2
          ->  Aggregate  (cost=0.02..0.03 rows=1 width=32) (never executed)
                ->  Sort  (cost=0.01..0.02 rows=1 width=32) (never executed)
                      Sort Key: ph."createdAt"
                      ->  Seq Scan on "Photo" ph  (cost=0.00..0.00 rows=1 width=32) (never executed)
                            Filter: (("businessPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'IMAGE'::"MediaKind"))
Planning:
  Buffers: shared hit=85
Planning Time: 0.963 ms
Execution Time: 0.082 ms
```

5.253500000002532 ms:

```sql
 SELECT p.id, p.body, p."createdAt", p."editedAt", p.score, p."upCount", p."downCount", p."commentCount", p."authorId", u.username, u.status::text AS author_status, coalesce(pr.color, 'teal') AS author_color, pr."avatarPhotoId" AS avatar_photo_id, COALESCE((SELECT array_agg(a.key ORDER BY a.key) FROM "UserAchievement" ua JOIN "Achievement" a ON a.id = ua."achievementId" WHERE ua."userId" = p."authorId" AND a.active), '{}'::varchar[]) AS medals, (SELECT json_agg(json_build_object('id', ph.id, 'width', ph.width, 'height', ph.height) ORDER BY ph."createdAt") FROM "Photo" ph WHERE ph."generalPostId" = p.id AND ph.status = 'ACTIVE' AND ph.kind = 'IMAGE') AS photos, (SELECT json_build_object('id', vc.id, 'durationMs', vc."durationMs") FROM "Photo" vc WHERE vc."generalPostId" = p.id AND vc.status = 'ACTIVE' AND vc.kind = 'AUDIO' LIMIT 1) AS voice, (SELECT json_build_object('id', vd.id, 'durationMs', vd."durationMs", 'width', vd.width, 'height', vd.height) FROM "Photo" vd WHERE vd."generalPostId" = p.id AND vd.status = 'ACTIVE' AND vd.kind = 'VIDEO' LIMIT 1) AS video, v.value AS my_vote, ST_Distance(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance, NULL::uuid AS place_id, NULL::text AS place_name, false AS is_owner FROM "GeneralPost" p JOIN "User" u ON u.id = p."authorId" LEFT JOIN "Profile" pr ON pr."userId" = u.id LEFT JOIN "Vote" v ON v."generalPostId" = p.id AND v."voterId" = $3::uuid WHERE p.status = 'VISIBLE' AND p."authorId" = $4::uuid ORDER BY p."cre
```

```
Limit  (cost=20.54..99.76 rows=3 width=399) (actual time=0.128..0.161 rows=4 loops=1)
  Buffers: shared hit=25
  ->  Result  (cost=20.54..99.76 rows=3 width=399) (actual time=0.127..0.159 rows=4 loops=1)
        Buffers: shared hit=25
        ->  Incremental Sort  (cost=20.54..58.86 rows=3 width=359) (actual time=0.078..0.080 rows=4 loops=1)
              Sort Key: p."createdAt" DESC, p.id DESC
              Presorted Key: p."createdAt"
              Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 26kB  Peak Memory: 26kB
              Buffers: shared hit=25
              ->  Nested Loop Left Join  (cost=1.43..58.72 rows=3 width=359) (actual time=0.049..0.072 rows=4 loops=1)
                    Buffers: shared hit=25
                    ->  Nested Loop  (cost=1.00..33.14 rows=3 width=189) (actual time=0.033..0.041 rows=4 loops=1)
                          Buffers: shared hit=13
                          ->  Index Scan using "GeneralPost_authorId_createdAt_idx" on "GeneralPost" p  (cost=0.42..16.48 rows=3 width=154) (actual time=0.009..0.013 rows=4 loops=1)
                                Index Cond: ("authorId" = '01a161ee-cb46-7421-95a5-eb9953bddfdf'::uuid)
                                Filter: (status = 'VISIBLE'::"ContentStatus")
                                Buffers: shared hit=7
                          ->  Materialize  (cost=0.58..16.63 rows=1 width=51) (actual time=0.006..0.006 rows=1 loops=4)
                                Buffers: shared hit=6
                                ->  Nested Loop Left Join  (cost=0.58..16.62 rows=1 width=51) (actual time=0.021..0.022 rows=1 loops=1)
                                      Buffers: shared hit=6
                                      ->  Index Scan using "User_pkey" on "User" u  (cost=0.29..8.31 rows=1 width=30) (actual time=0.005..0.006 rows=1 loops=1)
                                            Index Cond: (id = '01a161ee-cb46-7421-95a5-eb9953bddfdf'::uuid)
                                            Buffers: shared hit=3
                                      ->  Index Scan using "Profile_pkey" on "Profile" pr  (cost=0.29..8.31 rows=1 width=37) (actual time=0.004..0.004 rows=1 loops=1)
                                            Index Cond: ("userId" = '01a161ee-cb46-7421-95a5-eb9953bddfdf'::uuid)
                                            Buffers: shared hit=3
                    ->  Index Scan using "Vote_voterId_generalPostId_key" on "Vote" v  (cost=0.43..8.45 rows=1 width=18) (actual time=0.003..0.003 rows=0 loops=4)
                          Index Cond: (("voterId" = '01a161ee-cb46-7421-95a5-eb9953bddfdf'::uuid) AND ("generalPostId" = p.id))
                          Buffers: shared hit=12
                    SubPlan 3
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.002..0.002 rows=0 loops=4)
                            ->  Seq Scan on "Photo" vc  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=4)
                                  Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'AUDIO'::"MediaKind"))
                    SubPlan 4
                      ->  Limit  (cost=0.00..0.00 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=4)
                            ->  Seq Scan on "Photo" vd  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=4)
                                  Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'VIDEO'::"MediaKind"))
        SubPlan 1
          ->  Aggregate  (cost=1.07..1.08 rows=1 width=32) (actual time=0.005..0.005 rows=1 loops=4)
                ->  Sort  (cost=1.06..1.07 rows=1 width=18) (actual time=0.004..0.004 rows=0 loops=4)
                      Sort Key: a.key
                      Sort Method: quicksort  Memory: 25kB
                      ->  Hash Join  (cost=0.01..1.05 rows=1 width=18) (actual time=0.003..0.003 rows=0 loops=4)
                            Hash Cond: (a.id = ua."achievementId")
                            ->  Seq Scan on "Achievement" a  (cost=0.00..1.03 rows=3 width=34) (never executed)
                                  Filter: active
                            ->  Hash  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=4)
                                  Buckets: 1024  Batches: 1  Memory Usage: 8kB
                                  ->  Seq Scan on "UserAchievement" ua  (cost=0.00..0.00 rows=1 width=16) (actual time=0.000..0.000 rows=0 loops=4)
                                        Filter: ("userId" = p."authorId")
        SubPlan 2
          ->  Aggregate  (cost=0.02..0.03 rows=1 width=32) (actual time=0.002..0.002 rows=1 loops=4)
                ->  Sort  (cost=0.01..0.02 rows=1 width=32) (actual time=0.002..0.002 rows=0 loops=4)
                      Sort Key: ph."createdAt"
                      Sort Method: quicksort  Memory: 25kB
                      ->  Seq Scan on "Photo" ph  (cost=0.00..0.00 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=4)
                            Filter: (("generalPostId" = p.id) AND (status = 'ACTIVE'::"PhotoStatus") AND (kind = 'IMAGE'::"MediaKind"))
Planning:
  Buffers: shared hit=59
Planning Time: 0.716 ms
Execution Time: 0.231 ms
```

### Admin queue

5.642899999998917 ms:

```sql
SELECT "public"."GeneralPost"."id", "public"."GeneralPost"."authorId", "public"."GeneralPost"."body", "public"."GeneralPost"."status"::text, "public"."GeneralPost"."score", "public"."GeneralPost"."upCount", "public"."GeneralPost"."downCount", "public"."GeneralPost"."commentCount", "public"."GeneralPost"."createdAt", "public"."GeneralPost"."updatedAt", "public"."GeneralPost"."editedAt", "public"."GeneralPost"."statusChangedAt" FROM "public"."GeneralPost" WHERE "public"."GeneralPost"."id" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65,$66,$67,$68,$69,$70,$71,$72,$73,$74,$75,$76,$77,$78,$79,$80,$81,$82,$83,$84,$85,$86,$87,$88,$89,$90,$91,$92,$93,$94,$95,$96,$97,$98,$99,$100,$101,$102,$103,$104,$105,$106,$107,$108,$109,$110,$111,$112,$113,$114,$115,$116,$117,$118,$119,$120,$121,$122,$123,$124,$125,$126,$127,$128,$129,$130,$131,$132,$133,$134,$135,$136,$137,$138,$139,$140,$141,$142,$143,$144,$145,$146,$147,$148,$149,$150,$151,$152,$153,$154,$155,$156,$157,$158,$159,$160,$161,$162,$163,$164,$165,$166,$167,$168,$169,$170,$171,$172,$173,$174,$175,$176,$177,$178,$179,$180,$181,$182,$183,$184,$185,$186,$187,$188,$189,$190,$191,$192,$193,$194,$195,$196,$197,$198,$199,$200,$201,$202,$203,$204,$205,$206,$207,$208,$209,$210,$211,$212,$213,$214,$215,$216,$217,$218,$219,$220,$221,$222,$2
```

```
Index Scan using "GeneralPost_pkey" on "GeneralPost"  (cost=0.42..813.41 rows=320 width=170) (actual time=0.058..0.927 rows=320 loops=1)
  Index Cond: (id = ANY ('{01a161ee-d8f4-7046-baf6-8136ef4c803d,01a161ee-da62-7d39-8bef-6ae10a9694f4,01a161ee-fd24-7f8f-8369-3c61cf090a66,01a161ee-fcc8-7f73-ae8a-9515e4abcdf7,01a161ee-d93c-7d03-a55d-2d99b6043ded,01a161ee-f196-7814-8b41-a0a9a9b61323,01a161ee-e57c-71c3-adf4-fe2827517cd5,01a161ee-fca3-76a2-904a-8f0e29024e1e,01a161ee-ed69-7eb2-ba3a-1ae08e82a658,01a161ee-ed58-7e90-a170-297ec9fbb956,01a161ee-e9fc-7e33-89ac-25793af71f54,01a161ee-f5df-7b5b-b76e-8442f3bcf1c8,01a161ee-ec41-7d1e-a3ba-641659fa48ab,01a161ee-ee32-753a-8214-cf6c7c361cf7,01a161ee-f31e-7acd-8a9e-5b73b8430611,01a161ee-e988-7c79-9291-a6fb31b3edb8,01a161ee-dfe9-79ad-a710-abac97b90f12,01a161ee-fce6-71c8-840f-8dc731e31a91,01a161ee-e7de-721a-9fb5-5c86e504cfc6,01a161ee-d8e1-71f5-85bd-58c06b99dea5,01a161ee-dda4-7f1e-ad85-d751f707836b,01a161ee-f211-7042-af52-ad1d18c279f1,01a161ee-f3c0-7c21-86cd-be5599f305c5,01a161ee-fe80-777b-a672-ed8d42d4bb1c,01a161ee-dc3c-72b7-bbdd-7d3d2dd6f312,01a161ee-e5ba-7c8a-b1ba-46d5b2bf47f9,01a161ee-e809-7cbe-af1a-b06ca5b99d2f,01a161ee-fe1f-72b7-a451-00a2e62cea0a,01a161ee-f339-7b49-808b-2b27b3eefa75,01a161ee-ee23-70cf-8e3a-ffe0f8404e16,01a161ee-fa59-7497-b916-a35875d507c0,01a161ee-eecf-73cc-904c-d8b34e7d4a7f,01a161ee-f4d0-7be0-9799-e7a75d12610b,01a161ee-f5ab-7930-b41f-cd2ef4cea615,01a161ee-ef42-7521-810b-2d7961a0ba6d,01a161ee-fd15-78d8-843b-0bdacebe6a2d,01a161ee-eb85-7fdc-9d3f-de5714c63524,01a161ee-ea17-7266-a8bf-cecb617cbb08,01a161ee-fc20-752e-a5d2-22a386f8fe7f,01a161ee-db3b-702c-9351-16ab8dab424b,01a161ee-eaef-788f-bbfb-c581788e7999,01a161ee-f1a3-7613-bc5a-63f926c1bcb8,01a161ee-eb68-7be8-a169-7fd1b1ea5acb,01a161ee-e91a-7555-b9f6-d730d0034e9e,01a161ee-ec88-75fb-9bf4-685c09e9be5e,01a161ee-ec06-7d24-8def-9f15184fff5c,01a161ee-fda7-7719-97ac-356fc4d78e80,01a161ee-f653-78bb-b5a7-48685e424d95,01a161ee-eb29-7a2c-8409-a169f413dcd6,01a161ee-efe8-79d6-9cbd-b8809a4f7e62,01a161ee-e859-7690-b144-432f335119c1,01a161ee-e529-79f3-8794-52912a925e02,01a161ee-fade-79e9-9f7b-a0e1629eacc9,01a161ee-fb95-7ceb-9d58-37c60174cc23,01a161ee-dc2c-7148-85d5-bdc214de5803,01a161ee-d9ff-7208-b603-c2ceae98cf5b,01a161ee-f2c4-7279-8c17-337f81dd2554,01a161ee-e75a-79b2-8378-00072e3d555a,01a161ee-dc81-7250-86bc-94b31b4daa97,01a161ee-ee88-726d-be96-a2b7337d30ef,01a161ee-eebe-7e0f-a90a-a5090f862141,01a161ee-f506-76be-84b0-bf0b6e29ca50,01a161ee-e6e1-781d-8765-b49d9171b0ea,01a161ee-fa71-77c3-872f-378c1abe0bb9,01a161ee-fbbd-7242-9054-e9d4dc9270e3,01a161ee-def0-784c-9f65-4e44622b57bd,01a161ee-e878-7496-a904-04beb601a6d9,01a161ee-e67e-773f-a5ad-029b7beb71d8,01a161ee-f3d9-789d-9e1f-30d985e9f138,01a161ee-e9ba-79b1-af10-e6a6a566997a,01a161ee-f096-7ef1-aaf7-c89f2a62af63,01a161ee-fe40-7885-8564-b6d1790031a9,01a161ee-da0b-7e15-a6f2-0615cee88789,01a161ee-f0dc-7d43-8004-f7285571c8a3,01a161ee-d8fd-7edd-945e-8601fb73d1e2,01a161ee-d9ac-7ea2-a18b-c3c882ce8837,01a161ee-e9cc-703b-9f36-7ecabd32e11c,01a161ee-ebb1-7203-98dc-7eb2e8e662fd,01a161ee-f727-78a7-adef-3d7afada4896,01a161ee-f44f-73f3-996d-04c82aea1194,01a161ee-f30f-78ee-9008-776dc94f5179,01a161ee-e94f-7283-aeab-b85269e185d1,01a161ee-e6d3-7432-be07-c9d6e0ec7447,01a161ee-f32b-7166-83a6-986cf48a45e4,01a161ee-efdb-7aad-aaa5-bc330a616b46,01a161ee-f2b5-7f3f-9da9-3be61df64e6b,01a161ee-dd60-7500-90aa-00e9040e2eff,01a161ee-e893-7d6c-a69d-e3574d48215a,01a161ee-db8f-7389-8dd8-5db8c7dfcdc0,01a161ee-e86a-78e3-b6e5-61b19f4a7509,01a161ee-e7ad-7ffd-9037-4dfad14ac602,01a161ee-e79c-7602-be11-ea8ffb30966d,01a161ee-e691-7302-933d-2b6b5e29e64a,01a161ee-e6bf-7589-bb74-d4e60951bdde,01a161ee-f3ab-7e07-84cb-d202f0e7cdf9,01a161ee-fdd5-7932-b017-aa58e73bdfcd,01a161ee-e8f4-7381-8a85-549a7a3f0da4,01a161ee-e74b-7029-87cc-09ae6b4135d3,01a161ee-e884-7f2e-9ca0-5329c5f327c1,01a161ee-f9ec-702c-8302-8a403289bad4,01a161ee-fafd-7b0f-9418-b0a48cb6d2ac,01a161ee-ec70-74a1-b3ab-b178d2a415dc,01a161ee-ee6d-7cb4-8e2a-3fa30d0259e1,01a161ee-d972-7dcc-82df-cdd21f004834,01a161ee-ea83-7e8a-ab61-3ba8cbd4ce4d,01a161ee-f8b9-73b1-b7eb-a35eede7f629,01a161ee-fac5-7664-95ec-f99473badaee,01a161ee-e84a-7422-a248-3e44cb0ef3d5,01a161ee-f3e9-7ddb-990f-5061fada0e14,01a161ee-fad0-77f3-b138-718e4863bc76,01a161ee-e77b-7ef9-b1e0-095d17232cd5,01a161ee-ef9a-7e43-8913-7fd6c317f634,01a161ee-e6ad-735f-b66b-c263e740f6ef,01a161ee-de3b-734a-818d-036968628ad0,01a161ee-ec16-79ae-be7f-aa0f9b7875bb,01a161ee-f246-7cdc-9270-bf40d698197f,01a161ee-e7c2-74b2-8a21-2a3a72b0b2b5,01a161ee-f516-7dc4-b8d3-4e82182ee7d3,01a161ee-f115-7a3d-84f2-8e5786e01204,01a161ee-fbcc-74d9-96f5-60e6822243ce,01a161ee-e548-7805-b104-130f3d61e0eb,01a161ee-fcf6-75f4-a46f-ddf52a499bf4,01a161ee-ebf6-7d8b-b8dd-6814d917eb87,01a161ee-da3e-7dd0-8d6d-b60ae5e6c3af,01a161ee-db62-7844-90ec-749d32d5d2b0,01a161ee-fdba-78f2-999d-648221350e4a,01a161ee-dde9-7b50-be12-c3eada2ceb44,01a161ee-fe61-77e5-a142-6f4e37bec918,01a161ee-f0cb-7ad0-b290-717bb136ddb6,01a161ee-fcd7-7ce0-8367-e9934bbc0703,01a161ee-da9c-7bc8-bf9c-77251159d286,01a161ee-ed49-7ded-a46b-978b05aee70e,01a161ee-e908-76b3-84ee-704908b0b467,01a161ee-f755-7c57-91a0-cb0bbac68bf9,01a161ee-fb6d-772d-8990-d020d612e145,01a161ee-d8be-7c41-b6b5-5fc88c825dec,01a161ee-e7f8-707b-89c8-d503ff41cb57,01a161ee-f0aa-74dd-9516-854466d2eaab,01a161ee-f936-7f59-b31f-cbe2c3eb53af,01a161ee-eaa6-70cc-bd16-4083e589f492,01a161ee-f43e-72c4-980d-858a1da8ea66,01a161ee-e9a8-7e2f-888b-5e3b3e144ba6,01a161ee-e961-7368-9303-7437c3a79fb1,01a161ee-f407-7267-af0a-4bf26c7709a1,01a161ee-fc0f-791f-97bd-3543bb92abf4,01a161ee-ef8a-7788-aa19-25dfb4c8f0c3,01a161ee-fde7-79ef-83b3-91e1e6c11c1b,01a161ee-f1f2-7868-aeec-22ba833f1631,01a161ee-d964-7d2d-b653-e0c7ad518025,01a161ee-dc10-7371-83e0-8ce4894183b1,01a161ee-eea2-7f0c-adba-c08c8c71863f,01a161ee-fe10-7fa6-b0a9-f9c7d856903c,01a161ee-faef-7576-9cf2-38a1460b89c3,01a161ee-f54d-71e3-bfa3-97c2671e1f94,01a161ee-e69f-7953-9397-2b1a30f8c6b8,01a161ee-e5ae-732f-92eb-faf40292d181,01a161ee-dbee-737b-a6de-ad2aa485170c,01a161ee-effe-7385-bf58-2ee05c38c64a,01a161ee-fec8-73c0-b9f0-19d990f95577,01a161ee-d982-7ed0-a7c0-f4b2bf4b5e5e,01a161ee-f2a7-75f2-9c96-c01fff213416,01a161ee-ea66-70a3-9f6d-7dd3600a3eb4,01a161ee-da51-7603-81c9-17ac14c9e2d4,01a161ee-fab2-7aba-8c6c-a0a657b5c26b,01a161ee-ee41-7995-ae57-7b59db6c9863,01a161ee-f97b-71ba-8da8-8a8f49e2e039,01a161ee-f6dc-710b-88b2-a5bea69974e6,01a161ee-e78d-7ff2-be97-bf4567699c16,01a161ee-d94a-7005-be84-ea1ca58c4ff1,01a161ee-f233-7109-a109-00a9328b28f9,01a161ee-f5c6-7753-b919-9004832bf124,01a161ee-ec61-72f3-99d9-8dd30af4ca84,01a161ee-f300-715c-806e-1b0cdfe013e1,01a161ee-fd37-72be-89e8-7bd63c6c6dd8,01a161ee-d918-7e90-af92-569d6b40d3e3,01a161ee-ed33-7c88-a61c-9b4b26b45957,01a161ee-f45d-7a41-9465-b3a10d6267d0,01a161ee-f221-7792-b006-462353f0025c,01a161ee-f624-7643-8482-bf81c5da975c,01a161ee-f42d-7d36-89bd-d42135163e14,01a161ee-fb7d-75e0-8b95-363012266d67,01a161ee-f4e2-7e82-9662-502a3de1dd98,01a161ee-fba1-7a72-8a65-56d8ca33ff49,01a161ee-ef5e-703e-8766-98a087a1874f,01a161ee-fbaf-70de-8157-d1148e7a139a,01a161ee-f202-7baa-be93-50dcdf11bd43,01a161ee-e58e-7b77-8910-556abc21e101,01a161ee-e566-7e64-a450-b6eda9e7b2c3,01a161ee-e83b-7d4b-a7a1-7ca40de10213,01a161ee-f146-7853-bc93-c94c72acb07e,01a161ee-eb06-70bb-b1e1-bca7b5bbb529,01a161ee-f709-7ebf-b642-ddadbfbb5a7e,01a161ee-f1c2-7a24-9a85-661fd744e99b,01a161ee-f359-7cec-913d-c0db3df3fd57,01a161ee-ee7a-72e9-9164-aa50be513de5,01a161ee-f122-78f6-a2bd-b1a9ab663322,01a161ee-e672-7a84-bc1a-5df39e30b0d0,01a161ee-e5d4-7559-a000-77164f6f48d8,01a161ee-ee95-7c10-b8bb-b98e1bb05d74,01a161ee-dba7-7073-b85a-f56b1f8f7159,01a161ee-efa7-7a23-84f0-2cc9f0e1fb65,01a161ee-f1d3-78ce-9ede-6ed5ee93e934,01a161ee-e5c8-70f7-9c0d-e45dc2ed18aa,01a161ee-efc3-71ce-9514-c07a38ae2d85,01a161ee-da8a-7c5a-8797-dacecd2a8d6e,01a161ee-fc7f-734e-ba11-99df2b8f4584,01a161ee-d959-7701-8699-70ebc4501f95,01a161ee-d924-7214-b35c-0354b71f55f1,01a161ee-dc01-72a6-a5dd-558a6e940421,01a161ee-ec26-7048-b18d-cc4e0b2449c0,01a161ee-ec34-751f-8b4f-4c967949880f,01a161ee-e998-776d-9288-b9ba64ea5a29,01a161ee-feb8-7cf6-b3ae-f85a36d316eb,01a161ee-e4cc-782b-8a85-5d8c543bcc7b,01a161ee-fc00-7953-bfc2-5e7cc42fb9d2,01a161ee-d992-7ebf-a1e5-13d69ba3e873,01a161ee-dca9-75a9-9897-8235807ba0b5,01a161ee-db79-730c-99fa-c7bae4256cb2,01a161ee-e48b-7bdc-8219-fbc92fd3b237,01a161ee-e240-7a13-90bc-5c79d59acd57,01a161ee-f602-799c-b36a-04f567f60f01,01a161ee-da16-7ca2-8b33-7af4b21aedae,01a161ee-f0bb-7617-ab77-2946247f3d8b,01a161ee-fe2e-7bce-b684-654892b84881,01a161ee-fe54-7219-ba8b-4076a8b3fbec,01a161ee-ed1f-757f-a011-0f3c80a976e7,01a161ee-fa9f-76fd-9216-5268d79b9dc8,01a161ee-dd7e-76a1-8543-b6f8c7bce787,01a161ee-d8d5-7513-baad-3b78e4863135,01a161ee-f883-7993-8927-1169f9186279,01a161ee-ef6c-72a8-9093-75624cf15847,01a161ee-da77-7540-ace1-53db6cd28bbe,01a161ee-f8ea-7d4c-a3dc-3f1c699f5df8,01a161ee-f1e2-7cbf-beae-ddf419c3fccf,01a161ee-d909-7ad1-a380-0784cfea9584,01a161ee-d9d0-799f-99c2-a22e73c3b161,01a161ee-e5ee-7132-a7be-24f25dc833be,01a161ee-efb6-7938-a241-c1c790b45041,01a161ee-f2d2-772f-81f5-453f377c1e19,01a161ee-ea0a-7207-a912-e32278b36596,01a161ee-e8e1-7a9d-b29b-f6813c17e9a1,01a161ee-ee5e-7e8b-8741-58eec2c6c0f3,01a161ee-eb9c-758b-b605-618de3095cee,01a161ee-f4bd-7c57-ba7a-ff2351986053,01a161ee-e8b1-78f0-acf5-bd522f11dec2,01a161ee-f8a1-78b4-aea5-35a224765632,01a161ee-d9be-7923-8773-87a6c0bae2f0,01a161ee-db15-758c-bf7d-27a7d7c8b935,01a161ee-f107-79c7-9bbd-03178a04e608,01a161ee-ea4f-7658-acbb-0ea147161e5a,01a161ee-e0f6-7d0c-afac-bf2fbe8f3bfb,01a161ee-e8c5-74fc-b728-6178deb4b857,01a161ee-f4f4-7ae5-9027-7b1f8be70a6a,01a161ee-fbd9-75eb-b2dc-8c8a2c8854c6,01a161ee-eeb1-76c5-bea3-ef2fe073086f,01a161ee-f561-7223-979f-0d45949e6c5a,01a161ee-e977-7016-853e-6b5c9854cd9d,01a161ee-f0ea-729b-99d0-493e26d7989a,01a161ee-e6ef-7e5f-ac9f-ad98c2d79812,01a161ee-fdff-7266-bab8-1e3070e4e9ad,01a161ee-ed0c-7ac0-8090-9e2d34f504a0,01a161ee-f9a8-7c11-bbe6-31c27c24ecd1,01a161ee-ecf4-7c1c-8518-3e10e97da8d7,01a161ee-f6ba-788f-84ef-bd14f09a059f,01a161ee-edab-716c-8cd8-64e21b8b29cc,01a161ee-f0fa-7c75-a7fa-984d7d7a3a44,01a161ee-dc58-72b9-8a36-e4b8042476ae,01a161ee-fe73-7457-96e6-c3d3b2c1c7de,01a161ee-dc1e-7b39-b5cb-4d3f22e76b9f,01a161ee-f9cb-7c7b-b498-f5589285f381,01a161ee-ed8c-78aa-8d06-a458da29209c,01a161ee-fd08-78e6-b7a9-611b610d9cc6,01a161ee-db27-70b1-8e9b-e1ca64a7d8d6,01a161ee-fa86-7691-9060-1144d7dadbb8,01a161ee-e8a4-7762-a478-942bb7187fbd,01a161ee-fcb1-770f-8ce5-d6853ef38600,01a161ee-daf7-742e-8ccf-21a85f05c001,01a161ee-f3f9-741c-b81d-65bb42fcad88,01a161ee-eb4a-7873-a428-0de03c954ae3,01a161ee-e939-700a-8e3a-5195dd6eff74,01a161ee-e5e0-78ac-97c1-734f415c50aa,01a161ee-e663-78e8-80a2-3db0a5ce8264,01a161ee-fed7-7e97-8739-71891c71634e,01a161ee-ed7e-70e0-873e-0e030a774915,01a161ee-d8eb-7234-b226-0b25d09a9b17,01a161ee-d8c9-7ae2-aaca-1cf5f897d515,01a161ee-f2e1-773a-9aaf-e124d4d40ac8,01a161ee-f52b-79a9-b0ef-c05d09ee0b32,01a161ee-ec51-75d2-8d2c-5286dc76b3d7,01a161ee-f6f3-74b6-9365-e46b8b6e9cf6,01a161ee-da2a-7c9f-b78f-0920ea834787,01a161ee-ea2c-76d4-a7ad-a852668f91c8,01a161ee-e5a2-75e4-8f92-d3496627497e,01a161ee-fbf3-7c02-b741-4994561f7e9b,01a161ee-e502-7151-9ac4-b8943432af63,01a161ee-f53b-7c6f-8a5b-4209d095f9fc,01a161ee-ee4e-7c5b-91cf-cca1ed4f2855,01a161ee-f1b2-7a32-b8ae-bfdf5d5c4e8d,01a161ee-dab8-788e-a6d7-2a1ea90582eb,01a161ee-db08-70b4-b61b-23b44de9c154,01a161ee-dd93-75ac-affd-a0b9bb44a146,01a161ee-f2f2-7c73-88d6-27785aeb93d6,01a161ee-db4f-77a7-86fe-a7c2b2353a1f,01a161ee-ec9f-7c40-9222-1a6abd1abc73,01a161ee-d92f-7f92-9307-a51a65369157,01a161ee-ed9c-785a-ac98-a28671597cb4,01a161ee-f12f-77a4-acf6-89f0ca3f6e10,01a161ee-efcf-7546-a2bd-3c808d85bba3,01a161ee-ef7b-7ea0-adb6-ef9a71485f65,01a161ee-f959-75fe-8272-7484185689b9,01a161ee-fbe7-7182-9923-774723952610,01a161ee-fc8d-71d4-85da-d39b331df63c,01a161ee-f58a-7003-b73f-52130b18c4f4,01a161ee-f41a-7be8-a86d-52b0ff81b4aa,01a161ee-f348-77d2-93da-fa76562b9d24,01a161ee-f8d6-719f-bbcb-bfb01bfa255e,01a161ee-e703-7181-bcf7-d0b80df15188,01a161ee-fb8a-7b5f-a81c-50c51d507459,01a161ee-ef4f-76d9-ab02-6d9964a3047a,01a161ee-f906-7a21-b4f3-29192ce75caa}'::uuid[]))
  Buffers: shared hit=1280
Planning:
  Buffers: shared hit=7
Planning Time: 0.186 ms
Execution Time: 0.949 ms
```

4.599299999998038 ms:

```sql
SELECT "public"."User"."id", "public"."User"."username", "public"."User"."status"::text FROM "public"."User" WHERE "public"."User"."id" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65,$66,$67,$68,$69,$70,$71,$72,$73,$74,$75,$76,$77,$78,$79,$80,$81,$82,$83,$84,$85,$86,$87,$88,$89,$90,$91,$92,$93,$94,$95,$96,$97,$98,$99,$100,$101,$102,$103,$104,$105,$106,$107,$108,$109,$110,$111,$112,$113,$114,$115,$116,$117,$118,$119,$120,$121,$122,$123,$124,$125,$126,$127,$128,$129,$130,$131,$132,$133,$134,$135,$136,$137,$138,$139,$140,$141,$142,$143,$144,$145,$146,$147,$148,$149,$150,$151,$152,$153,$154,$155,$156,$157,$158,$159,$160,$161,$162,$163,$164,$165,$166,$167,$168,$169,$170,$171,$172,$173,$174,$175,$176,$177,$178,$179,$180,$181,$182,$183,$184,$185,$186,$187,$188,$189,$190,$191,$192,$193,$194,$195,$196,$197,$198,$199,$200,$201,$202,$203,$204,$205,$206,$207,$208,$209,$210,$211,$212,$213,$214,$215,$216,$217,$218,$219,$220,$221,$222,$223,$224,$225,$226,$227,$228,$229,$230,$231,$232,$233,$234,$235,$236,$237,$238,$239,$240,$241,$242,$243,$244,$245,$246,$247,$248,$249,$250,$251,$252,$253,$254,$255,$256,$257,$258,$259,$260,$261,$262,$263,$264,$265,$266,$267,$268,$269,$270,$271,$272,$273,$274,$275,$276,$277,$278,$279,$280,$281,$282,$283,$284,$285,$286,$287,$288,$289,$290,$291,$292,$293,$29
```

```
Index Scan using "User_pkey" on "User"  (cost=0.29..265.09 rows=320 width=58) (actual time=0.060..0.696 rows=309 loops=1)
  Index Cond: (id = ANY ('{01a161ee-d07a-7ffc-906f-9e75ed69c6c1,01a161ee-cc37-79ec-945d-2d70652fa50a,01a161ee-caed-7e72-ba07-45e25986c708,01a161ee-ccb0-7818-947e-b6670e0c7f5e,01a161ee-ce56-7dc4-8a2a-52e19afdc0d2,01a161ee-cea7-734c-9458-c8d07744a814,01a161ee-d161-7b7f-a691-cc079d1fdd7f,01a161ee-cdef-7e52-bacf-0afd1cbfe9f9,01a161ee-cb2e-75da-b00f-eeb62d3bf2ac,01a161ee-d16a-7fb0-b47a-02b053da1e20,01a161ee-cbc0-7c5b-a7be-76bf60065764,01a161ee-cdca-7b13-9a4e-f261b4c97878,01a161ee-cac5-78d5-878e-ceccf979a5cf,01a161ee-d2af-7de9-aa13-2b14b6c06593,01a161ee-cf89-7aeb-8dae-69acf02c66e7,01a161ee-cb4e-71d8-af07-ec52757b9257,01a161ee-d28e-77a4-a4f9-1875a58de0ed,01a161ee-cf43-7973-b41d-6e281ea20265,01a161ee-cebe-7f5f-af2b-acf8a0b9b366,01a161ee-cbf9-7051-a6b6-8bc5222f5a6c,01a161ee-cee5-72c8-b670-8069c9df529b,01a161ee-d11d-70da-802e-53924e4607e2,01a161ee-cb5f-762c-8971-b6ca53a3faa9,01a161ee-ced5-7ee5-9b6f-5fe7a8129922,01a161ee-cd86-7878-a6d1-6a253d213b61,01a161ee-cfd8-72ba-bca5-3c943b24ab34,01a161ee-cb34-74af-a138-00acfe7b2083,01a161ee-cd6a-7a20-ae1b-82e8efd697f1,01a161ee-cf43-755e-b7b8-ccb7cd0e282e,01a161ee-d20d-7efc-b3d7-a5d238f3b11c,01a161ee-ce97-7cc1-bcfb-487ea60eb484,01a161ee-d2a0-7bd2-9006-3bdc934d460e,01a161ee-cc35-7efa-a5f8-82de085c206d,01a161ee-cd59-7f9a-832b-9fea51c5b394,01a161ee-cd3b-7f61-945f-6818a47a08b0,01a161ee-cb69-7c0e-9a17-e98be15cce72,01a161ee-caf7-73fd-bb29-c8eeae4c2492,01a161ee-d275-76af-9f32-bbe46941934d,01a161ee-d04a-7650-ad42-c4b9dd19de98,01a161ee-d178-78ae-8c6f-308636e2dbfd,01a161ee-d1b5-7299-aed9-bbbd5a2127a7,01a161ee-d0ac-77aa-aa6d-4552b4e05c6b,01a161ee-d28a-7bb3-9ece-70ee165c421a,01a161ee-ce07-7c0a-804f-446b676f4737,01a161ee-d10d-77c1-b831-3c92da7a0edf,01a161ee-cd0c-79eb-9fd6-237162233843,01a161ee-cb03-74e0-aef0-245c52640557,01a161ee-d16f-7620-bd7e-bc041d0823f4,01a161ee-cfde-7bb3-af91-cab27431ad61,01a161ee-cec9-7202-8ca6-e6a319a9123f,01a161ee-d14d-7084-989d-cc1f9647cf8a,01a161ee-cde7-7b2b-9b82-9d3057ba561c,01a161ee-d29f-7996-9127-3836cc7662cd,01a161ee-cafc-794f-bb50-767392899feb,01a161ee-cf1d-7642-bc2d-570efcafe8fe,01a161ee-cac8-7641-9a4f-5ffe6333988a,01a161ee-cdaa-7e4b-8435-a335037a5d51,01a161ee-cc83-77cc-a707-679d01c35646,01a161ee-d1c1-74b2-ba31-96ae0f067cf3,01a161ee-d10c-719c-96a8-c66cb006e6fa,01a161ee-d06c-74fc-8dc8-aaa820cff023,01a161ee-ce96-70c3-9472-00836bfebff7,01a161ee-d104-794d-a8a6-acc1f021604f,01a161ee-d0d5-70c6-8446-b3b8c79a14c6,01a161ee-cbc3-76f2-bed4-733fa94c93c7,01a161ee-d06c-7016-9ac2-4e9b4221426d,01a161ee-d25d-7563-abd1-7cc904dc95d7,01a161ee-d24d-74ee-adcf-560994704984,01a161ee-ce05-763b-8931-1452e96fceca,01a161ee-d2be-73fa-bf0e-5938d9377ce8,01a161ee-cb2b-7256-9818-7f8afcb6571c,01a161ee-cde6-7999-acfc-4c41486113e7,01a161ee-ce88-7085-a090-07ef62bd3bd3,01a161ee-d215-7162-9a77-9a2b81efd582,01a161ee-d2bd-797e-9f11-7d9973bbecea,01a161ee-d292-77b6-951f-04109a380b05,01a161ee-d0a9-7e5f-bb18-864819307a06,01a161ee-cb9c-7f39-81b1-2183fbcf9cdc,01a161ee-d022-70e7-b0c3-0a3dbb5f8d97,01a161ee-cf4a-752f-b1bc-827ef1773333,01a161ee-cd8d-7e3e-a7b7-f0d918a3aa9c,01a161ee-cb7a-7467-a337-bdc82c446a0b,01a161ee-cd5c-780f-8b8e-d8b8b1b13ab0,01a161ee-cad7-7c0e-9701-4aac94bb63cc,01a161ee-cc00-7de2-ac32-5ea54bbc7d28,01a161ee-d0fa-7813-836b-1888acfeee60,01a161ee-d27b-7114-b177-b3e0f32eb54c,01a161ee-cda8-7b45-aced-746f7ad7d56d,01a161ee-d228-7950-89d3-d2400b296a46,01a161ee-cb38-73a2-a5f8-e62ed7ec0fd0,01a161ee-cd99-7462-a599-beccd5dc6ce8,01a161ee-d163-758e-b237-20ca22ee00a7,01a161ee-ce86-758e-b85b-7881f73c7163,01a161ee-d037-7ffb-bd5f-f0cc420637f9,01a161ee-ce48-7f5e-a413-aa39d611d92c,01a161ee-d253-7609-a8b6-65aeae59c853,01a161ee-cd6e-731b-8aea-0d21c64bb087,01a161ee-ced7-701c-b729-06f03976b3bc,01a161ee-cf67-7e68-b10f-6f4e91d85ffd,01a161ee-cf97-7a4a-bbf5-d799a104f140,01a161ee-caf9-7c77-ba69-cfa1cfcde1e6,01a161ee-cb28-7a79-8a32-be7e53cdcc87,01a161ee-d2b0-755b-a861-9d50a5b6f57a,01a161ee-cd87-772e-a12d-23358d8164d3,01a161ee-d0c1-7adc-a2bc-d217b798a87c,01a161ee-cda2-7b6b-96e9-c80b1aacc511,01a161ee-ce1c-7a05-baac-08b5f97aace5,01a161ee-cdef-7e52-bacf-0afd1cbfe9f9,01a161ee-ccaf-7f2a-adf7-b802783233d9,01a161ee-cad6-7658-bcb1-01ff9bd78412,01a161ee-cca0-7816-9da7-0b1a21b74633,01a161ee-cd97-793d-9057-065cce989095,01a161ee-cac5-78d5-878e-ceccf979a5cf,01a161ee-ce32-7e42-b5ae-04e12d79e10d,01a161ee-cdc5-7833-b67a-6a77711b1183,01a161ee-cb4e-71d8-af07-ec52757b9257,01a161ee-cf62-70cd-ad83-320e72c17ad0,01a161ee-d1af-75d9-a91e-1bed735bb29c,01a161ee-d0ff-754f-b3c9-87bb6056546c,01a161ee-d282-7cfb-bc65-de37d1e66e0b,01a161ee-d2a0-7fb3-b1a4-33bd78062033,01a161ee-ce8b-7fbe-bef9-08e38fef4da6,01a161ee-cac4-7ff9-a377-bd78a7e4fd32,01a161ee-ce84-779b-8591-0fffea0f6101,01a161ee-cdc4-79fb-9020-3fdcfde3905e,01a161ee-d0c0-7439-ac4d-1f1a391deb3f,01a161ee-cc87-73dd-a572-1ea1fe27ab93,01a161ee-cb73-7a47-8bf5-f407a98afb6a,01a161ee-cfd0-7c53-98ef-673a678ef8cb,01a161ee-d029-79f8-b86c-9b86d97b4504,01a161ee-cbd5-7f1b-9fba-cc4bfe4c5b0f,01a161ee-d03a-7bb9-ae97-2215ce8a1fb1,01a161ee-cb73-75e0-ad12-22c15e413069,01a161ee-d122-77bb-81d4-6efbcf0d75cd,01a161ee-d179-79b0-bdb9-569837e23f9e,01a161ee-cfa2-755c-888a-97744e6fc732,01a161ee-cecf-7beb-b598-b63695cbd084,01a161ee-cd69-7c8b-8e41-b7aa9bb827e9,01a161ee-d2c2-7629-bf0a-006b6e63791d,01a161ee-d080-7401-af78-f0bf67db64cb,01a161ee-d01e-7bbe-b886-ef6cf1f68783,01a161ee-cd45-73d3-92b7-030ce8b58c2d,01a161ee-ceb7-7274-961f-d782a753ad73,01a161ee-cded-7c8f-8ce3-b3ad574f0a8c,01a161ee-cdce-7f72-8f28-a47a6411f52d,01a161ee-d01e-7889-8465-df93f5a9fc12,01a161ee-cf3c-7d57-9726-c5759b195569,01a161ee-cb16-7e36-a1d9-5ab13eedcc18,01a161ee-ce9c-78e6-8fc5-fc82adcee2ec,01a161ee-d2ab-7df2-bff2-cf4ed856ca23,01a161ee-cea2-7d2a-a37f-f19889d46ed3,01a161ee-ccb4-7240-9934-1c0f46f9cf84,01a161ee-d0c5-7438-bae9-d9d554a4cdfb,01a161ee-cfde-75ad-853f-7b4789a0190c,01a161ee-ce82-7fee-b55c-a6077c661a73,01a161ee-d134-7566-a0b0-c50d53f2303c,01a161ee-cde7-7501-8d26-74ba142508b6,01a161ee-d24f-7044-b73b-a88bddaf5f8d,01a161ee-d13e-7518-a9a3-011400a2cadb,01a161ee-cf6f-7535-835f-0252e7bc5fc4,01a161ee-ceef-7f8a-bc32-a73c43e526f2,01a161ee-ccdd-7c74-b483-d4e01d5743be,01a161ee-cfb8-7684-a676-cff75b3228ab,01a161ee-ce3b-7d5a-a3e8-50d785b93761,01a161ee-cfce-7dae-80e3-6775bf6adde7,01a161ee-cfc1-72cf-93e7-a5763244db1a,01a161ee-cb43-74fc-921b-4352811774e0,01a161ee-cd1a-7579-b8ba-6baa84de2fde,01a161ee-cef6-7f62-bef3-d9c6c06ac810,01a161ee-d120-745b-9aaf-531f161edfaf,01a161ee-ce1f-755e-83b8-23a4f6186acd,01a161ee-d0aa-7141-900b-ae448d2884dd,01a161ee-cddc-791e-a410-7f99d930c4f4,01a161ee-d29e-7511-aef6-7c539ce6f894,01a161ee-cced-7359-ba67-0979b2ebb7e9,01a161ee-ceae-76cf-a37f-e96b3ec70784,01a161ee-cb0f-70a6-9c59-be58d0e82318,01a161ee-d102-7a9d-b33d-9c21efadf677,01a161ee-cea8-7837-bfc0-dd90582aabb7,01a161ee-cb51-75ff-aeb2-ce82bfd34abe,01a161ee-cb2a-70f5-9f49-d5ba553b7d78,01a161ee-cd83-7a4f-906b-4b087d4db76b,01a161ee-d23b-7c6e-b332-953a92f0d32c,01a161ee-cacc-77dd-95a2-3fd7bc7cda14,01a161ee-cb07-7784-af5c-8647db78c1b6,01a161ee-cad1-7e5d-95d2-9205521787a2,01a161ee-cd00-79a0-976d-d4d731247967,01a161ee-ce94-7dec-85f0-8ec2909255c9,01a161ee-d285-7cec-bbca-bdbd685f0684,01a161ee-cf40-724a-be2c-c128420ede4e,01a161ee-cbc2-71e8-8cc0-9e6551f88e65,01a161ee-cf85-7467-a44b-a4bdf22a405f,01a161ee-cbbc-7420-ae84-03013a9935c6,01a161ee-cb9c-7554-8ab7-06b744e3844a,01a161ee-cdb9-7465-b90b-3a4b10f38d84,01a161ee-d2bb-7516-9fde-85e244e0adbf,01a161ee-cf1b-7b87-ab4b-dbb0bc7c22f3,01a161ee-cb55-7e69-8f89-805fd7fe7385,01a161ee-cdd1-75f5-9d41-b5574c5d67d9,01a161ee-d319-7824-8005-bab54a95f2a4,01a161ee-d0a0-7fe8-a796-cfc48b44033b,01a161ee-cd20-791a-b392-a7c39a16e957,01a161ee-ce93-7e0a-9b1a-d62d98563132,01a161ee-cec0-7301-996c-f9c57e682897,01a161ee-d0c1-7adc-a2bc-d217b798a87c,01a161ee-cb4f-7715-8c1e-9d8a6768b290,01a161ee-cf62-7bd0-9f97-770ca131142f,01a161ee-d011-7636-a314-4e3af4602ffe,01a161ee-cb2e-75da-b00f-eeb62d3bf2ac,01a161ee-cb81-77f1-a1df-ead539862a1e,01a161ee-ce2a-7ad2-bb83-dd846e0a1c40,01a161ee-cadb-7573-b90b-dace476cf064,01a161ee-d207-7e42-9df8-58c39b148ab7,01a161ee-d095-755c-8569-8ed21b9218b6,01a161ee-d327-7e3e-a8af-9081aeba161c,01a161ee-ce99-7353-ab05-bdaf2d192beb,01a161ee-cada-7ebd-a433-a36e8401d311,01a161ee-cafe-7ad0-bd9d-17fd899910c7,01a161ee-ce84-7a7c-8856-640b813498ae,01a161ee-cfb3-7085-9842-550c53d11e0e,01a161ee-cde9-7249-942a-ee683250d78f,01a161ee-cb8a-799f-b3f2-6c4b5a28371e,01a161ee-cdf8-7cbf-b5de-0085eea4ce16,01a161ee-d040-7250-a1af-ba69bd195809,01a161ee-cdc4-79fb-9020-3fdcfde3905e,01a161ee-cfca-7783-a137-e854a9824143,01a161ee-cb4d-7622-8f77-13ca6cdd2c42,01a161ee-cdbf-7756-a44a-3bf55595d279,01a161ee-cde4-75b6-8091-53658dc44430,01a161ee-cac9-7caf-bc7b-268c5ffd1569,01a161ee-cb12-7b9f-8699-a1635fc4c544,01a161ee-cae6-799f-932e-a57cbfefdc6d,01a161ee-ceec-71ea-aba7-77c607e143db,01a161ee-caec-7663-b2be-28823098da1d,01a161ee-cfa1-7b81-a2ae-d1b17e38065c,01a161ee-d136-7922-a4f8-b1d800dfe1b9,01a161ee-cf60-7ef2-88dc-e52e2db39bcd,01a161ee-cacf-78c8-b494-4660df988ba4,01a161ee-ce91-7e83-b638-15b053f0d063,01a161ee-cf29-76ee-b5f4-749f0f5624b5,01a161ee-d25e-7b80-83e7-94b57aa718c4,01a161ee-ce46-7cfe-a1dc-a7f5237e7c15,01a161ee-cb89-7457-a2c9-a10320253cb7,01a161ee-d266-788b-9bc4-45e5253f1947,01a161ee-cc93-7361-96a0-d20fec94b71f,01a161ee-cf51-7aab-bb4e-2b8668515d37,01a161ee-cb46-74ac-badc-d301a4a7150a,01a161ee-cd7c-7d4e-b4cc-db7a3e08ef93,01a161ee-d31e-7362-9192-f6f5d073cfb9,01a161ee-cec9-7202-8ca6-e6a319a9123f,01a161ee-d14d-7084-989d-cc1f9647cf8a,01a161ee-caf5-7127-8b6f-b34cd5695d23,01a161ee-ce27-79b5-8ab0-e3f5dcadcb69,01a161ee-cfde-75ad-853f-7b4789a0190c,01a161ee-cade-7a6d-a490-51915a0b8172,01a161ee-d26c-774f-8840-a46024cc9ec9,01a161ee-cf76-79a7-91a5-fa3feb85abf5,01a161ee-d104-7d36-9d89-3cd60b9c3c49,01a161ee-ccee-7e64-b7bb-b74dd025452e,01a161ee-d1ac-79fa-b8ab-61d8d8f3d448,01a161ee-d27c-7ef5-ba33-8a9dfba9c185,01a161ee-cb57-79d3-b4b5-19ec40a83a7d,01a161ee-d075-7629-b417-42c3a937a055,01a161ee-cb16-74fc-be23-f1553f4b53de,01a161ee-d048-7eec-a65a-59a746496e92,01a161ee-ce0d-78ed-b470-e2552adaef3e,01a161ee-d04f-71bd-876c-3fa62b581d3d,01a161ee-cf76-734a-acdc-72d685b5f48d,01a161ee-cf55-7cd4-9db1-7faa320c72e9,01a161ee-d2be-73fa-bf0e-5938d9377ce8,01a161ee-cebc-7381-b488-51ed4ddf53dd,01a161ee-cd71-7133-b1ed-a61dd3311c30,01a161ee-cc9b-7f29-9124-39660e126b51,01a161ee-cd7a-77ac-b2fd-0209e291294f,01a161ee-d1bc-7d2a-860c-cc712997a974,01a161ee-d07d-7ba3-b21c-8c3a58ad6962,01a161ee-cdfc-7c59-82a5-623d49de4758,01a161ee-cd9e-7fe9-92fb-1b2d9e04c087,01a161ee-cf55-7433-b2a3-687765cdea41,01a161ee-cdeb-7e82-8fbe-e307fbbf47d6,01a161ee-cb92-739f-9a47-694ca9c9ca6c,01a161ee-cf91-7a18-afcd-e81db775c44f,01a161ee-d042-74c3-9743-d971bdabb0c1,01a161ee-ce25-7c5a-9a18-d59811589d34,01a161ee-cfdb-7ef2-a3dc-eaa9e67f54d1,01a161ee-cdcc-7596-b7d5-e50f143f8506,01a161ee-ce51-7a88-a954-cde12a014277,01a161ee-cf3a-7445-813e-b1b6824518d8,01a161ee-d211-7f40-af9a-af37336365a8,01a161ee-d047-7571-aa17-6990869577f2,01a161ee-d108-7caa-a57d-7e614874475d,01a161ee-cf59-7ba1-a096-0db5831e2345,01a161ee-cf44-7fb5-8d2e-6549fc3879d9,01a161ee-d037-7ffb-bd5f-f0cc420637f9,01a161ee-cea7-7b85-b4f9-cdcd35886bbe,01a161ee-d08c-79a6-b16a-7777ba0a92d6,01a161ee-cdfb-70ed-b882-f32db8982419,01a161ee-ce94-7169-bb82-f8f82562dbdb,01a161ee-ce33-7d53-868b-fc558bfc2b12,01a161ee-d062-7ae6-92aa-fd98c899c957,01a161ee-cba5-7207-88ff-dfad2967da4e,01a161ee-ce0a-770b-806f-46d27b8efe0c,01a161ee-cde5-74b9-9dfa-2846b51e4b17,01a161ee-d037-737c-8c83-13ce5c24d5a7,01a161ee-cb6b-711c-ac93-1502dcd6d10a,01a161ee-d12b-7d5d-8709-6a4b5413185b,01a161ee-cb1a-7080-af05-87689735ad44,01a161ee-d0a6-7f1a-91ce-d29fd998a081,01a161ee-d248-718f-9237-9b41c822d3b4,01a161ee-cce5-7846-b852-e5bce5007df9,01a161ee-d319-74b9-a423-076b377e91e5,01a161ee-d01a-7e99-b7fb-b4143823599e,01a161ee-d1af-7f3c-8b52-bbe7a1900963,01a161ee-d0a7-7032-bda9-c60eff672732,01a161ee-d283-77bd-9bdd-fdc738fbb69b,01a161ee-cedb-7c4d-a288-854c64428db7,01a161ee-d02f-75f5-81ba-11c0fc430469,01a161ee-ce4e-7f3e-93fd-0544c98e3083,01a161ee-cf34-78f2-8420-e5acce9e9a61,01a161ee-cf52-7f64-b8e1-58174a62301d}'::uuid[]))
  Buffers: shared hit=621
Planning Time: 0.146 ms
Execution Time: 0.727 ms
```
