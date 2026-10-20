-- CreateEnum
CREATE TYPE "PlaceRemovalStatus" AS ENUM ('OPEN', 'REMOVED', 'KEPT', 'EXPIRED');

-- AlterEnum
ALTER TYPE "PlaceStatus" ADD VALUE 'REMOVED';

-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'EXPIRED';

-- CreateTable
CREATE TABLE "PlaceRemoval" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "status" "PlaceRemovalStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" UUID,

    CONSTRAINT "PlaceRemoval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceChangeVote" (
    "id" UUID NOT NULL,
    "voterId" UUID NOT NULL,
    "submissionId" UUID,
    "removalId" UUID,
    "support" BOOLEAN NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceChangeVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaceRemoval_status_createdAt_idx" ON "PlaceRemoval"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PlaceRemoval_placeId_idx" ON "PlaceRemoval"("placeId");

-- CreateIndex
CREATE INDEX "PlaceChangeVote_submissionId_idx" ON "PlaceChangeVote"("submissionId");

-- CreateIndex
CREATE INDEX "PlaceChangeVote_removalId_idx" ON "PlaceChangeVote"("removalId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceChangeVote_voterId_submissionId_key" ON "PlaceChangeVote"("voterId", "submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceChangeVote_voterId_removalId_key" ON "PlaceChangeVote"("voterId", "removalId");

-- AddForeignKey
ALTER TABLE "PlaceRemoval" ADD CONSTRAINT "PlaceRemoval_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceRemoval" ADD CONSTRAINT "PlaceRemoval_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceRemoval" ADD CONSTRAINT "PlaceRemoval_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceChangeVote" ADD CONSTRAINT "PlaceChangeVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceChangeVote" ADD CONSTRAINT "PlaceChangeVote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "BusinessSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceChangeVote" ADD CONSTRAINT "PlaceChangeVote_removalId_fkey" FOREIGN KEY ("removalId") REFERENCES "PlaceRemoval"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- D94: a vote is on exactly one thing; only one open removal request per place.
ALTER TABLE "PlaceChangeVote" ADD CONSTRAINT "PlaceChangeVote_one_target"
  CHECK (("submissionId" IS NOT NULL)::int + ("removalId" IS NOT NULL)::int = 1);
CREATE UNIQUE INDEX "PlaceRemoval_one_open_per_place" ON "PlaceRemoval"("placeId") WHERE status = 'OPEN';
