-- D188: giveaways run from the admin portal; winners are told in the app (the bell).
-- UserActiveDay: the days a signed-in person used the app (giveaway tickets).
-- CreateEnum
CREATE TYPE "GiveawayStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GiveawayPick" AS ENUM ('RANDOM', 'MANUAL');

-- CreateEnum
CREATE TYPE "GiveawayWinnerStatus" AS ENUM ('NOTIFIED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'PRIZE_SENT', 'DISQUALIFIED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GIVEAWAY_WIN';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "giveawayWinnerId" UUID;

-- CreateTable
CREATE TABLE "UserActiveDay" (
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "UserActiveDay_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "prize" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(2000),
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "pickMethod" "GiveawayPick" NOT NULL,
    "winnerCount" SMALLINT NOT NULL,
    "respondDays" SMALLINT NOT NULL DEFAULT 5,
    "minPosts" SMALLINT,
    "minPostDays" SMALLINT,
    "minComments" SMALLINT,
    "minApprovedPlaces" SMALLINT,
    "requireConfirmedEmail" BOOLEAN NOT NULL DEFAULT true,
    "requireNoStrikes" BOOLEAN NOT NULL DEFAULT false,
    "joinedAfter" TIMESTAMPTZ(3),
    "joinedBefore" TIMESTAMPTZ(3),
    "minAccountAgeDays" SMALLINT,
    "minActiveDays" SMALLINT,
    "ticketsPerActiveDay" BOOLEAN NOT NULL DEFAULT false,
    "excludePastWinners" BOOLEAN NOT NULL DEFAULT false,
    "status" "GiveawayStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayWinner" (
    "id" UUID NOT NULL,
    "giveawayId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "GiveawayWinnerStatus" NOT NULL DEFAULT 'NOTIFIED',
    "pickedBy" "GiveawayPick" NOT NULL,
    "poolSize" INTEGER NOT NULL,
    "tickets" INTEGER,
    "poolTickets" INTEGER,
    "pickedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondBy" TIMESTAMPTZ(3) NOT NULL,
    "respondedAt" TIMESTAMPTZ(3),
    "emailRevealedAt" TIMESTAMPTZ(3),
    "prizeSentAt" TIMESTAMPTZ(3),
    "adminNote" VARCHAR(500),

    CONSTRAINT "GiveawayWinner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserActiveDay_day_idx" ON "UserActiveDay"("day");

-- CreateIndex
CREATE INDEX "Giveaway_createdAt_idx" ON "Giveaway"("createdAt");

-- CreateIndex
CREATE INDEX "Giveaway_createdById_idx" ON "Giveaway"("createdById");

-- CreateIndex
CREATE INDEX "GiveawayWinner_userId_idx" ON "GiveawayWinner"("userId");

-- CreateIndex
CREATE INDEX "GiveawayWinner_pickedById_idx" ON "GiveawayWinner"("pickedById");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayWinner_giveawayId_userId_key" ON "GiveawayWinner"("giveawayId", "userId");

-- CreateIndex
CREATE INDEX "Notification_giveawayWinnerId_idx" ON "Notification"("giveawayWinnerId") WHERE ("giveawayWinnerId" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_giveawayWinnerId_fkey" FOREIGN KEY ("giveawayWinnerId") REFERENCES "GiveawayWinner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActiveDay" ADD CONSTRAINT "UserActiveDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayWinner" ADD CONSTRAINT "GiveawayWinner_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayWinner" ADD CONSTRAINT "GiveawayWinner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayWinner" ADD CONSTRAINT "GiveawayWinner_pickedById_fkey" FOREIGN KEY ("pickedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- D188: sane values even if a row is written outside the API.
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_period_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_winnerCount_check" CHECK ("winnerCount" BETWEEN 1 AND 100);
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_respondDays_check" CHECK ("respondDays" BETWEEN 1 AND 30);
