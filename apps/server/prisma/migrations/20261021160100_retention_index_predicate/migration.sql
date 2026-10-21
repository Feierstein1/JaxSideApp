-- P13.7: same indexes with a predicate Prisma reads back unchanged ("status IN (...)" is stored by
-- Postgres as "= ANY (ARRAY[...])", which Prisma saw as a change on every diff, D109).

-- DropIndex
DROP INDEX "BusinessPost_statusChangedAt_idx";

-- DropIndex
DROP INDEX "Comment_statusChangedAt_idx";

-- DropIndex
DROP INDEX "GeneralPost_statusChangedAt_idx";

-- CreateIndex
CREATE INDEX "BusinessPost_statusChangedAt_idx" ON "BusinessPost"("statusChangedAt") WHERE ("statusChangedAt" IS NOT NULL);

-- CreateIndex
CREATE INDEX "Comment_statusChangedAt_idx" ON "Comment"("statusChangedAt") WHERE ("statusChangedAt" IS NOT NULL);

-- CreateIndex
CREATE INDEX "GeneralPost_statusChangedAt_idx" ON "GeneralPost"("statusChangedAt") WHERE ("statusChangedAt" IS NOT NULL);

