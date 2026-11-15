-- D248: the launch tiers (Free forever, Standard, Premium), the Standard trial, promo codes and
-- boosts.

-- CreateEnum
CREATE TYPE "BoostStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BoostSource" AS ENUM ('PLAN', 'COMP', 'PAID');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "endingNoticeAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "planId" UUID NOT NULL,
    "days" INTEGER NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(300),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" UUID NOT NULL,
    "codeId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "redeemedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boost" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "adId" UUID,
    "eventId" UUID,
    "days" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "BoostStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "BoostSource" NOT NULL DEFAULT 'PLAN',
    "grantedByAdminId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Boost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_planId_idx" ON "PromoCode"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_accountId_key" ON "PromoRedemption"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_subscriptionId_key" ON "PromoRedemption"("subscriptionId");

-- CreateIndex
CREATE INDEX "PromoRedemption_codeId_redeemedAt_idx" ON "PromoRedemption"("codeId", "redeemedAt");

-- CreateIndex
CREATE INDEX "Boost_accountId_startsAt_idx" ON "Boost"("accountId", "startsAt");

-- CreateIndex
CREATE INDEX "Boost_status_endsAt_idx" ON "Boost"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Boost_adId_idx" ON "Boost"("adId");

-- CreateIndex
CREATE INDEX "Boost_eventId_idx" ON "Boost"("eventId");

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Promo codes: upper-case, sensible numbers, never used more than allowed.
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_upper" CHECK ("code" = upper("code") AND "code" ~ '^[A-Z0-9-]{4,24}$');
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_numbers"
  CHECK ("days" BETWEEN 1 AND 366 AND "maxUses" >= 1 AND "uses" BETWEEN 0 AND "maxUses");

-- Boosts: one ad or one event, 3, 7 or 14 days, ending when its days are up.
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_one_target" CHECK (("adId" IS NULL) <> ("eventId" IS NULL));
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_days" CHECK ("days" IN (3, 7, 14));
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_ends" CHECK ("endsAt" = "startsAt" + "days" * interval '24 hours');

-- The launch tiers (owner, 2026-11-13). Events per calendar month: Free 5, Standard 20,
-- Premium no limit; 20 saved ads on every plan; Free reaches about a mile (ads and events);
-- boosts a month: Free 0, Standard 1, Premium 2.
WITH v ("code", "key", "value") AS (VALUES
  ('FREE', 'events.limit', '5'), ('FREE', 'ads.library', '20'), ('FREE', 'ads.reach', '"NEAR"'),
  ('FREE', 'events.reach', '"NEAR"'), ('FREE', 'boosts.perMonth', '0'),
  ('STANDARD', 'events.limit', '20'), ('STANDARD', 'ads.library', '20'),
  ('STANDARD', 'events.reach', '"CITY"'), ('STANDARD', 'boosts.perMonth', '1'),
  ('PREMIUM', 'events.limit', 'null'), ('PREMIUM', 'ads.library', '20'),
  ('PREMIUM', 'events.reach', '"CITY"'), ('PREMIUM', 'boosts.perMonth', '2')
)
INSERT INTO "PlanEntitlement" ("id", "planId", "key", "value")
SELECT gen_random_uuid(), p."id", v."key", v."value"::jsonb
FROM v JOIN "Plan" p ON p."code" = v."code"
ON CONFLICT ("planId", "key") DO UPDATE SET "value" = EXCLUDED."value";

-- Free is forever now (the trial is Standard).
UPDATE "Plan" SET "durationDays" = NULL WHERE "code" = 'FREE';

-- Owner accounts left without a plan (their free month ended before D248) start on Free.
INSERT INTO "Subscription" ("id", "accountId", "planId", "status", "source", "startsAt", "createdAt")
SELECT gen_random_uuid(), a."id", p."id", 'ACTIVE', 'FREE_PLAN', now(), now()
FROM "BusinessAccount" a JOIN "Plan" p ON p."code" = 'FREE'
WHERE a."kind" IS NOT NULL AND a."createdById" IS NULL AND a."revokedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Subscription" s WHERE s."accountId" = a."id"
      AND s."status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE'));
