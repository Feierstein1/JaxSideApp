-- CreateEnum
CREATE TYPE "AdInterestKind" AS ENUM ('INTERESTED', 'NOT_INTERESTED');

-- AlterTable
ALTER TABLE "CityTopic" ADD COLUMN     "adFree" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AdInterest" (
    "userId" UUID NOT NULL,
    "adId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "choice" "AdInterestKind" NOT NULL,
    "countedOn" DATE NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdInterest_pkey" PRIMARY KEY ("userId","adId")
);

-- CreateTable
CREATE TABLE "AdViewMark" (
    "adId" UUID NOT NULL,
    "viewer" CHAR(43) NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "AdViewMark_pkey" PRIMARY KEY ("adId","viewer","day")
);

-- CreateIndex
CREATE INDEX "AdInterest_userId_accountId_updatedAt_idx" ON "AdInterest"("userId", "accountId", "updatedAt");

-- CreateIndex
CREATE INDEX "AdInterest_adId_idx" ON "AdInterest"("adId");

-- CreateIndex
CREATE INDEX "AdInterest_updatedAt_idx" ON "AdInterest"("updatedAt");

-- CreateIndex
CREATE INDEX "AdViewMark_day_idx" ON "AdViewMark"("day");

-- AddForeignKey
ALTER TABLE "AdInterest" ADD CONSTRAINT "AdInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdInterest" ADD CONSTRAINT "AdInterest_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdViewMark" ADD CONSTRAINT "AdViewMark_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

