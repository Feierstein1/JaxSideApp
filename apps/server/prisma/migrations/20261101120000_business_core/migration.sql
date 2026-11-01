-- CreateEnum
CREATE TYPE "BusinessRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AdTemplate" AS ENUM ('BANNER', 'POST', 'FEATURE');

-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "AdDecision" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "BusinessAccount" ADD COLUMN     "createdById" UUID,
ADD COLUMN     "passwordChangedAt" TIMESTAMPTZ(3),
ADD COLUMN     "suspendedAt" TIMESTAMPTZ(3),
ADD COLUMN     "totpEnabledAt" TIMESTAMPTZ(3),
ADD COLUMN     "totpLastStep" BIGINT,
ADD COLUMN     "totpSecretEnc" TEXT,
ADD COLUMN     "username" VARCHAR(40),
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "email" SET DATA TYPE VARCHAR(254);

-- CreateTable
CREATE TABLE "BusinessPlaceAccess" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "role" "BusinessRole" NOT NULL,
    "staffName" VARCHAR(30),
    "ownerClaimId" UUID,
    "grantedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BusinessPlaceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessInvite" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "placeId" UUID NOT NULL,
    "ownerClaimId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "usedByAccountId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "liveAdLimit" SMALLINT NOT NULL,
    "priceCents" INTEGER,
    "includesInsights" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "comped" BOOLEAN NOT NULL DEFAULT false,
    "grantedByAdminId" UUID,
    "note" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdMedia" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "storageKey" VARCHAR(200),
    "quarantineKey" VARCHAR(200),
    "status" "PhotoStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "mimeType" VARCHAR(40),
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AdMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "status" "AdStatus" NOT NULL DEFAULT 'DRAFT',
    "template" "AdTemplate" NOT NULL,
    "headline" VARCHAR(80) NOT NULL,
    "body" VARCHAR(500),
    "mediaId" UUID,
    "adultsOnly" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "daysOfWeek" SMALLINT NOT NULL DEFAULT 127,
    "dailyStartMin" SMALLINT,
    "dailyEndMin" SMALLINT,
    "radiusMeters" INTEGER,
    "zips" VARCHAR(5)[],
    "createdById" UUID,
    "submittedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdReview" (
    "id" UUID NOT NULL,
    "adId" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "decision" "AdDecision" NOT NULL,
    "reason" VARCHAR(500),
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdDailyStats" (
    "adId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "interested" INTEGER NOT NULL DEFAULT 0,
    "notInterested" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdDailyStats_pkey" PRIMARY KEY ("adId","day")
);

-- CreateIndex
CREATE INDEX "BusinessPlaceAccess_placeId_revokedAt_idx" ON "BusinessPlaceAccess"("placeId", "revokedAt");

-- CreateIndex
CREATE INDEX "BusinessPlaceAccess_ownerClaimId_idx" ON "BusinessPlaceAccess"("ownerClaimId");

-- CreateIndex
CREATE INDEX "BusinessPlaceAccess_grantedById_idx" ON "BusinessPlaceAccess"("grantedById");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessPlaceAccess_one_live" ON "BusinessPlaceAccess"("accountId", "placeId") WHERE ("revokedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessPlaceAccess_one_owner" ON "BusinessPlaceAccess"("placeId") WHERE (role = 'OWNER' AND "revokedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessInvite_tokenHash_key" ON "BusinessInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "BusinessInvite_ownerClaimId_idx" ON "BusinessInvite"("ownerClaimId");

-- CreateIndex
CREATE INDEX "BusinessInvite_placeId_idx" ON "BusinessInvite"("placeId");

-- CreateIndex
CREATE INDEX "BusinessInvite_usedByAccountId_idx" ON "BusinessInvite"("usedByAccountId");

-- CreateIndex
CREATE INDEX "BusinessInvite_expiresAt_idx" ON "BusinessInvite"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_one_active" ON "Subscription"("accountId") WHERE (status = 'ACTIVE');

-- CreateIndex
CREATE UNIQUE INDEX "AdMedia_storageKey_key" ON "AdMedia"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdMedia_quarantineKey_key" ON "AdMedia"("quarantineKey");

-- CreateIndex
CREATE INDEX "AdMedia_accountId_createdAt_idx" ON "AdMedia"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AdMedia_status_createdAt_idx" ON "AdMedia"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Ad_accountId_status_idx" ON "Ad"("accountId", "status");

-- CreateIndex
CREATE INDEX "Ad_status_startsAt_endsAt_idx" ON "Ad"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Ad_placeId_idx" ON "Ad"("placeId");

-- CreateIndex
CREATE INDEX "Ad_mediaId_idx" ON "Ad"("mediaId");

-- CreateIndex
CREATE INDEX "Ad_createdById_idx" ON "Ad"("createdById");

-- CreateIndex
CREATE INDEX "AdReview_adId_createdAt_idx" ON "AdReview"("adId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessAccount_username_key" ON "BusinessAccount"("username");

-- CreateIndex
CREATE INDEX "BusinessAccount_createdById_idx" ON "BusinessAccount"("createdById");

-- AddForeignKey
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPlaceAccess" ADD CONSTRAINT "BusinessPlaceAccess_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPlaceAccess" ADD CONSTRAINT "BusinessPlaceAccess_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPlaceAccess" ADD CONSTRAINT "BusinessPlaceAccess_ownerClaimId_fkey" FOREIGN KEY ("ownerClaimId") REFERENCES "OwnerClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPlaceAccess" ADD CONSTRAINT "BusinessPlaceAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessInvite" ADD CONSTRAINT "BusinessInvite_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessInvite" ADD CONSTRAINT "BusinessInvite_ownerClaimId_fkey" FOREIGN KEY ("ownerClaimId") REFERENCES "OwnerClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessInvite" ADD CONSTRAINT "BusinessInvite_usedByAccountId_fkey" FOREIGN KEY ("usedByAccountId") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdMedia" ADD CONSTRAINT "AdMedia_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "AdMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdReview" ADD CONSTRAINT "AdReview_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDailyStats" ADD CONSTRAINT "AdDailyStats_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- D169 / D171: rules Prisma can't express (kept as CHECK constraints, like the app's tables).
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_has_login"
  CHECK ("email" IS NOT NULL OR "username" IS NOT NULL);

ALTER TABLE "Plan" ADD CONSTRAINT "Plan_live_ad_limit" CHECK ("liveAdLimit" BETWEEN 0 AND 3);
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_price" CHECK ("priceCents" IS NULL OR "priceCents" >= 0);

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_dates"
  CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");

ALTER TABLE "Ad" ADD CONSTRAINT "Ad_days" CHECK ("daysOfWeek" BETWEEN 1 AND 127);
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_daily_window" CHECK (
  ("dailyStartMin" IS NULL AND "dailyEndMin" IS NULL)
  OR ("dailyStartMin" BETWEEN 0 AND 1439 AND "dailyEndMin" BETWEEN 1 AND 1440
      AND "dailyStartMin" <> "dailyEndMin")
);
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_dates"
  CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_radius"
  CHECK ("radiusMeters" IS NULL OR "radiusMeters" BETWEEN 100 AND 50000);
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_zip_count" CHECK (cardinality("zips") <= 30);

ALTER TABLE "AdDailyStats" ADD CONSTRAINT "AdDailyStats_counts"
  CHECK ("views" >= 0 AND "interested" >= 0 AND "notInterested" >= 0);
