-- P13.9 (DB review A8): vacuum the busiest tables sooner. By default autovacuum waits until 20%
-- of a table has changed, which on a large Vote or Message table means millions of dead rows
-- first. 2% keeps them tidy. Prisma doesn't track storage settings (no drift). LocationCheck
-- is split by day and dropped whole (P13.6), so it doesn't need this.
ALTER TABLE "Vote" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "Message" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "Notification" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "RateLimitCounter" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
