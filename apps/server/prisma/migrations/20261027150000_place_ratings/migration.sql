-- AlterTable
ALTER TABLE "BusinessPlace" ADD COLUMN     "dislikeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratingsLockedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "PlaceRating" (
    "placeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" SMALLINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlaceRating_pkey" PRIMARY KEY ("placeId","userId")
);

-- CreateIndex
CREATE INDEX "PlaceRating_userId_idx" ON "PlaceRating"("userId");

-- CreateIndex
CREATE INDEX "PlaceRating_updatedAt_idx" ON "PlaceRating"("updatedAt");

-- AddForeignKey
ALTER TABLE "PlaceRating" ADD CONSTRAINT "PlaceRating_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceRating" ADD CONSTRAINT "PlaceRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- D144: a vote is a like or a dislike; the counts never go negative.
ALTER TABLE "PlaceRating" ADD CONSTRAINT "PlaceRating_value_check" CHECK ("value" IN (1, -1));
ALTER TABLE "BusinessPlace" ADD CONSTRAINT "BusinessPlace_rating_counts_check" CHECK ("likeCount" >= 0 AND "dislikeCount" >= 0);
