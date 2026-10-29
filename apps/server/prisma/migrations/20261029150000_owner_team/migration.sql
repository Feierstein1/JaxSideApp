-- AlterEnum
ALTER TYPE "OwnerMethod" ADD VALUE 'TEAM';

-- AlterTable
ALTER TABLE "OwnerClaim" ADD COLUMN     "addedById" UUID,
ADD COLUMN     "primary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staffName" VARCHAR(30);

-- D157: the earliest verified owner of each place becomes its primary owner.
UPDATE "OwnerClaim" SET "primary" = true
WHERE id IN (
  SELECT DISTINCT ON ("placeId") id FROM "OwnerClaim"
  WHERE status = 'VERIFIED'
  ORDER BY "placeId", "verifiedAt" NULLS LAST, "createdAt"
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerClaim_one_primary" ON "OwnerClaim"("placeId") WHERE ("primary" AND status = 'VERIFIED');

