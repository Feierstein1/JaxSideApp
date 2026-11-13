-- D242 (D238): "Already on the calendar" for events, flyers on events, one kind per owner
-- account, and Owner / organizer change requests.

-- CreateEnum
CREATE TYPE "BusinessAccountKind" AS ENUM ('BUSINESS', 'ORGANIZER');

-- CreateEnum
CREATE TYPE "EventImageKind" AS ENUM ('FLYER', 'PHOTO');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "BusinessPlace" ADD COLUMN     "detailsSetAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "BusinessAccount" ADD COLUMN     "kind" "BusinessAccountKind";

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "duplicateOfId" UUID;

-- AlterTable
ALTER TABLE "EventImage" ADD COLUMN     "kind" "EventImageKind" NOT NULL DEFAULT 'PHOTO';

-- CreateTable
CREATE TABLE "PlaceChangeRequest" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "name" VARCHAR(200),
    "category" VARCHAR(60),
    "address" VARCHAR(300),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "note" VARCHAR(500),
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" VARCHAR(500),
    "decidedByAdminId" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizerNameRequest" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "currentName" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "note" VARCHAR(500),
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" VARCHAR(500),
    "decidedByAdminId" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerNameRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaceChangeRequest_status_createdAt_idx" ON "PlaceChangeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PlaceChangeRequest_accountId_idx" ON "PlaceChangeRequest"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceChangeRequest_one_open" ON "PlaceChangeRequest"("placeId") WHERE (status = 'PENDING');

-- CreateIndex
CREATE INDEX "OrganizerNameRequest_status_createdAt_idx" ON "OrganizerNameRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerNameRequest_one_open" ON "OrganizerNameRequest"("accountId") WHERE (status = 'PENDING');

-- CreateIndex
CREATE INDEX "Event_duplicateOfId_idx" ON "Event"("duplicateOfId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceChangeRequest" ADD CONSTRAINT "PlaceChangeRequest_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceChangeRequest" ADD CONSTRAINT "PlaceChangeRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerNameRequest" ADD CONSTRAINT "OrganizerNameRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A duplicate names the event it copies, never itself.
ALTER TABLE "Event" ADD CONSTRAINT "Event_duplicate_of"
  CHECK (("duplicateOfId" IS NULL OR "status" = 'DUPLICATE') AND "duplicateOfId" IS DISTINCT FROM "id");

-- Flyers (up to 2) and photos (up to 6) per event, whoever uploads them (the app or the
-- website).
CREATE OR REPLACE FUNCTION event_image_limits() RETURNS trigger AS $$
DECLARE
  n INT;
  lim INT;
BEGIN
  SELECT count(*) INTO n FROM "EventImage" WHERE "eventId" = NEW."eventId" AND kind = NEW.kind;
  IF NEW.kind = 'FLYER' THEN
    lim := 2;
  ELSE
    lim := 6;
  END IF;
  IF n > lim THEN
    RAISE EXCEPTION 'Too many % pictures on event %', NEW.kind, NEW."eventId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "EventImage_limits" AFTER INSERT OR UPDATE OF kind, "eventId"
  ON "EventImage" FOR EACH ROW EXECUTE FUNCTION event_image_limits();

-- A change asks for something; a pin comes whole; a decision has its date.
ALTER TABLE "PlaceChangeRequest" ADD CONSTRAINT "PlaceChangeRequest_something"
  CHECK ("name" IS NOT NULL OR "category" IS NOT NULL OR "address" IS NOT NULL OR "latitude" IS NOT NULL);
ALTER TABLE "PlaceChangeRequest" ADD CONSTRAINT "PlaceChangeRequest_pin_pair"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
ALTER TABLE "PlaceChangeRequest" ADD CONSTRAINT "PlaceChangeRequest_name_length"
  CHECK ("name" IS NULL OR length(trim("name")) BETWEEN 2 AND 200);
ALTER TABLE "PlaceChangeRequest" ADD CONSTRAINT "PlaceChangeRequest_decided"
  CHECK (("status" IN ('APPROVED', 'REJECTED')) = ("decidedAt" IS NOT NULL));
ALTER TABLE "OrganizerNameRequest" ADD CONSTRAINT "OrganizerNameRequest_name_length"
  CHECK (length(trim("name")) BETWEEN 2 AND 100);
ALTER TABLE "OrganizerNameRequest" ADD CONSTRAINT "OrganizerNameRequest_decided"
  CHECK (("status" IN ('APPROVED', 'REJECTED')) = ("decidedAt" IS NOT NULL));

-- Existing owner accounts get their kind from what they have: a place (Owner access or a
-- place request) makes a business, otherwise an organizer profile makes an organizer. Team
-- logins stay null.
UPDATE "BusinessAccount" a SET "kind" = 'BUSINESS'
WHERE a."createdById" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "BusinessTeamMember" t WHERE t."memberAccountId" = a.id)
  AND (EXISTS (SELECT 1 FROM "BusinessPlaceAccess" pa
               WHERE pa."accountId" = a.id AND pa.role = 'OWNER' AND pa."revokedAt" IS NULL)
       OR EXISTS (SELECT 1 FROM "BusinessVerificationRequest" r WHERE r."accountId" = a.id));
UPDATE "BusinessAccount" a SET "kind" = 'ORGANIZER'
WHERE a."kind" IS NULL AND a."createdById" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "BusinessTeamMember" t WHERE t."memberAccountId" = a.id)
  AND EXISTS (SELECT 1 FROM "EventOrganizer" o WHERE o."accountId" = a.id);

