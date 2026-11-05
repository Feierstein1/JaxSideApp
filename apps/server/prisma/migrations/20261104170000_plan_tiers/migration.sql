-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH');

-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('FREE_TIER', 'COMP', 'STRIPE');


-- DropIndex
DROP INDEX "Subscription_one_active";

-- AlterTable
ALTER TABLE "BusinessAccount" ADD COLUMN     "stripeCustomerId" VARCHAR(255);

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "code" VARCHAR(30),
ADD COLUMN     "durationDays" SMALLINT,
ADD COLUMN     "rank" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "stripeProductId" VARCHAR(255);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelReason" VARCHAR(300),
ADD COLUMN     "cancelledAt" TIMESTAMPTZ(3),
ADD COLUMN     "currentPeriodEnd" TIMESTAMPTZ(3),
ADD COLUMN     "currentPeriodStart" TIMESTAMPTZ(3),
ADD COLUMN     "freeTierPlaceId" UUID,
ADD COLUMN     "priceId" UUID,
ADD COLUMN     "source" "SubscriptionSource" NOT NULL DEFAULT 'COMP',
ADD COLUMN     "stripeSubscriptionId" VARCHAR(255);

-- CreateTable
CREATE TABLE "PlanPrice" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "amountCents" INTEGER,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "interval" "BillingInterval" NOT NULL DEFAULT 'MONTH',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stripePriceId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEntitlement" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "PlanEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanPrice_stripePriceId_key" ON "PlanPrice"("stripePriceId");

-- CreateIndex
CREATE INDEX "PlanPrice_planId_idx" ON "PlanPrice"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanPrice_one_active" ON "PlanPrice"("planId", "interval") WHERE (active);

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntitlement_planId_key_key" ON "PlanEntitlement"("planId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessAccount_stripeCustomerId_key" ON "BusinessAccount"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_stripeProductId_key" ON "Plan"("stripeProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_freeTierPlaceId_key" ON "Subscription"("freeTierPlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_priceId_idx" ON "Subscription"("priceId");

-- CreateIndex
CREATE INDEX "Subscription_status_endsAt_idx" ON "Subscription"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_one_active" ON "Subscription"("accountId") WHERE (status IN ('TRIALING', 'ACTIVE', 'PAST_DUE'));

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_one_free_tier" ON "Subscription"("accountId") WHERE (source = 'FREE_TIER');

-- AddForeignKey
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntitlement" ADD CONSTRAINT "PlanEntitlement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "PlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_freeTierPlaceId_fkey" FOREIGN KEY ("freeTierPlaceId") REFERENCES "BusinessPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- D202: sane values.
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_rank_nonneg" CHECK ("rank" >= 0);
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_duration_positive" CHECK ("durationDays" IS NULL OR "durationDays" > 0);
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_amount_nonneg" CHECK ("amountCents" IS NULL OR "amountCents" >= 0);
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_currency_code" CHECK ("currency" ~ '^[a-z]{3}$');
-- Only paid subscriptions point at a price.
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_price_only_stripe"
  CHECK ("priceId" IS NULL OR "source" = 'STRIPE');
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_free_place_only_free_tier"
  CHECK ("freeTierPlaceId" IS NULL OR "source" = 'FREE_TIER');

-- D202: today's plans keep working; copy their price and perks into the new tables.
INSERT INTO "PlanPrice" ("id", "planId", "amountCents", "currency", "interval", "active", "createdAt")
SELECT gen_random_uuid(), p."id", p."priceCents", 'usd', 'MONTH', true, now() FROM "Plan" p;
INSERT INTO "PlanEntitlement" ("id", "planId", "key", "value")
SELECT gen_random_uuid(), p."id", 'ads.live', to_jsonb(p."liveAdLimit"::int) FROM "Plan" p;
INSERT INTO "PlanEntitlement" ("id", "planId", "key", "value")
SELECT gen_random_uuid(), p."id", 'insights', to_jsonb(p."includesInsights") FROM "Plan" p;
-- Every subscription so far is an admin promo.
UPDATE "Subscription" SET "source" = 'COMP';
