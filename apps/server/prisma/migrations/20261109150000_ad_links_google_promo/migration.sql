-- AlterEnum
ALTER TYPE "ReportReason" ADD VALUE 'SELF_PROMOTION';

-- AlterTable
ALTER TABLE "Ad" ADD COLUMN     "linkLabel" VARCHAR(25),
ADD COLUMN     "linkUrl" VARCHAR(500);

-- AlterTable
ALTER TABLE "AdDailyStats" ADD COLUMN     "taps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "BusinessVerificationRequest" ADD COLUMN     "googleLocation" VARCHAR(100);

-- CreateTable
CREATE TABLE "AdTapMark" (
    "adId" UUID NOT NULL,
    "viewer" CHAR(43) NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "AdTapMark_pkey" PRIMARY KEY ("adId","viewer","day")
);

-- CreateIndex
CREATE INDEX "AdTapMark_day_idx" ON "AdTapMark"("day");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessVerificationRequest_one_open_google" ON "BusinessVerificationRequest"("googleLocation") WHERE (status = 'PENDING' AND "googleLocation" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "AdTapMark" ADD CONSTRAINT "AdTapMark_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- D216: a link is both an https address and its button text, or neither.
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_link_pair"
  CHECK (("linkUrl" IS NULL) = ("linkLabel" IS NULL));
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_link_https"
  CHECK ("linkUrl" IS NULL OR "linkUrl" LIKE 'https://%');
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_link_label_length"
  CHECK ("linkLabel" IS NULL OR length(trim("linkLabel")) BETWEEN 2 AND 25);

-- D216: links in ads are for paid plans: Free no, Standard and Premium yes.
INSERT INTO "PlanEntitlement" ("id", "planId", "key", "value")
SELECT gen_random_uuid(), p."id", 'ads.links', CASE WHEN p."code" = 'FREE' THEN 'false' ELSE 'true' END::jsonb
FROM "Plan" p WHERE p."code" IN ('FREE', 'STANDARD', 'PREMIUM')
ON CONFLICT ("planId", "key") DO UPDATE SET "value" = EXCLUDED."value";
