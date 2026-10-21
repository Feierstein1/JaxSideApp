-- P13.3 (DB review A6): rate-limit counters are updated constantly. Leaving 30% of each page free
-- lets Postgres update a counter in place (a "HOT" update) instead of writing it somewhere else
-- and touching the index. Prisma doesn't track storage settings (no drift). The table stays
-- crash-safe (not UNLOGGED), per D109.
ALTER TABLE "RateLimitCounter" SET (fillfactor = 70);
