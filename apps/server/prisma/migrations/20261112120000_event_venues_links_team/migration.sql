-- D236 (D232): venue confirmation and host places for events, links on events, and team
-- members on the owner account (invited by email).
-- CreateEnum
CREATE TYPE "EventVenueStatus" AS ENUM ('NONE', 'ASKED', 'CONFIRMED', 'DISPUTED');

-- AlterEnum
ALTER TYPE "ReportReason" ADD VALUE 'EVENT_NOT_AT_MY_PLACE';

-- AlterEnum
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'EVENT_AT_YOUR_PLACE';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "hostPlaceId" UUID,
ADD COLUMN     "linkLabel" VARCHAR(25),
ADD COLUMN     "linkUrl" VARCHAR(500),
ADD COLUMN     "venueAnsweredAt" TIMESTAMPTZ(3),
ADD COLUMN     "venueStatus" "EventVenueStatus" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "EventDailyStats" ADD COLUMN     "taps" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BusinessTeamMember" (
    "id" UUID NOT NULL,
    "ownerAccountId" UUID NOT NULL,
    "memberAccountId" UUID,
    "email" VARCHAR(254),
    "role" "BusinessRole" NOT NULL,
    "allPlaces" BOOLEAN NOT NULL DEFAULT true,
    "displayName" VARCHAR(30),
    "inviteTokenHash" CHAR(64),
    "inviteExpiresAt" TIMESTAMPTZ(3),
    "invitedById" UUID,
    "acceptedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BusinessTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTapMark" (
    "eventId" UUID NOT NULL,
    "viewer" CHAR(43) NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "EventTapMark_pkey" PRIMARY KEY ("eventId","viewer","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTeamMember_inviteTokenHash_key" ON "BusinessTeamMember"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "BusinessTeamMember_memberAccountId_idx" ON "BusinessTeamMember"("memberAccountId");

-- CreateIndex
CREATE INDEX "BusinessTeamMember_invitedById_idx" ON "BusinessTeamMember"("invitedById");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTeamMember_one_live_email" ON "BusinessTeamMember"("ownerAccountId", "email") WHERE ("revokedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTeamMember_one_team" ON "BusinessTeamMember"("memberAccountId") WHERE ("revokedAt" IS NULL);

-- CreateIndex
CREATE INDEX "EventTapMark_day_idx" ON "EventTapMark"("day");

-- CreateIndex
CREATE INDEX "Event_hostPlaceId_idx" ON "Event"("hostPlaceId");

-- AddForeignKey
ALTER TABLE "BusinessTeamMember" ADD CONSTRAINT "BusinessTeamMember_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTeamMember" ADD CONSTRAINT "BusinessTeamMember_memberAccountId_fkey" FOREIGN KEY ("memberAccountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTeamMember" ADD CONSTRAINT "BusinessTeamMember_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_hostPlaceId_fkey" FOREIGN KEY ("hostPlaceId") REFERENCES "BusinessPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTapMark" ADD CONSTRAINT "EventTapMark_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- D236: only business events have a host place; business events keep theirs (D230 used
-- placeId for it).
UPDATE "Event" SET "hostPlaceId" = "placeId" WHERE "hostKind" = 'BUSINESS' AND "placeId" IS NOT NULL;
ALTER TABLE "Event" ADD CONSTRAINT "Event_host_place_business"
  CHECK ("hostPlaceId" IS NULL OR "hostKind" = 'BUSINESS');
-- D230's "a business event is at its place" becomes "a business event names its place": it may
-- now be held elsewhere (another place, or a pin and address).
ALTER TABLE "Event" DROP CONSTRAINT "Event_business_place";
ALTER TABLE "Event" ADD CONSTRAINT "Event_business_host_place"
  CHECK ("hostKind" <> 'BUSINESS' OR "hostPlaceId" IS NOT NULL);
-- A venue answer only when there was a question.
ALTER TABLE "Event" ADD CONSTRAINT "Event_venue_answer"
  CHECK (("venueAnsweredAt" IS NULL) = ("venueStatus" IN ('NONE', 'ASKED')));

-- D236 (D216 rules): event links.
ALTER TABLE "Event" ADD CONSTRAINT "Event_link_pair"
  CHECK (("linkUrl" IS NULL) = ("linkLabel" IS NULL));
ALTER TABLE "Event" ADD CONSTRAINT "Event_link_https"
  CHECK ("linkUrl" IS NULL OR "linkUrl" LIKE 'https://%');
ALTER TABLE "Event" ADD CONSTRAINT "Event_link_label_length"
  CHECK ("linkLabel" IS NULL OR length(trim("linkLabel")) BETWEEN 2 AND 25);

-- D236: team members are Managers or Staff, emails lower-cased, an accepted member has a login,
-- and a legacy row without an email has a login.
ALTER TABLE "BusinessTeamMember" ADD CONSTRAINT "BusinessTeamMember_not_owner"
  CHECK ("role" <> 'OWNER');
ALTER TABLE "BusinessTeamMember" ADD CONSTRAINT "BusinessTeamMember_email_lower"
  CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "BusinessTeamMember" ADD CONSTRAINT "BusinessTeamMember_accepted_login"
  CHECK ("acceptedAt" IS NULL OR "memberAccountId" IS NOT NULL);
ALTER TABLE "BusinessTeamMember" ADD CONSTRAINT "BusinessTeamMember_email_or_login"
  CHECK ("email" IS NOT NULL OR "memberAccountId" IS NOT NULL);
ALTER TABLE "BusinessTeamMember" ADD CONSTRAINT "BusinessTeamMember_not_self"
  CHECK ("memberAccountId" IS NULL OR "memberAccountId" <> "ownerAccountId");

-- Existing staff logins (made by an owner, per place) join that owner's team, limited to the
-- places they already have (allPlaces false), with their best role there.
INSERT INTO "BusinessTeamMember"
  ("id", "ownerAccountId", "memberAccountId", "email", "role", "allPlaces", "displayName",
   "acceptedAt", "createdAt")
SELECT gen_random_uuid(), a."createdById", a.id, lower(a.email),
       CASE WHEN bool_or(pa.role = 'MANAGER') THEN 'MANAGER'::"BusinessRole" ELSE 'STAFF'::"BusinessRole" END,
       false, max(pa."staffName"), a."createdAt", a."createdAt"
FROM "BusinessAccount" a
JOIN "BusinessPlaceAccess" pa ON pa."accountId" = a.id AND pa."revokedAt" IS NULL AND pa.role <> 'OWNER'
WHERE a."createdById" IS NOT NULL AND a."revokedAt" IS NULL AND a."createdById" <> a.id
GROUP BY a.id;
