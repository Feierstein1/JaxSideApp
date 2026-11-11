-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SUGGESTED', 'DRAFT', 'IN_REVIEW', 'APPROVED', 'DENIED', 'CANCELLED', 'REMOVED');

-- CreateEnum
CREATE TYPE "EventHostKind" AS ENUM ('COMMUNITY', 'BUSINESS', 'ORGANIZER');

-- CreateEnum
CREATE TYPE "EventSetting" AS ENUM ('INDOOR', 'OUTDOOR', 'MIXED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'EVENT_TOMORROW';
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportReason" ADD VALUE 'EVENT_WRONG_DETAILS';
ALTER TYPE "ReportReason" ADD VALUE 'EVENT_FAKE';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "eventId" UUID,
ADD COLUMN     "eventSessionId" UUID;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "eventId" UUID;

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "status" "EventStatus" NOT NULL,
    "hostKind" "EventHostKind" NOT NULL DEFAULT 'COMMUNITY',
    "title" VARCHAR(100) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "setting" "EventSetting" NOT NULL,
    "free" BOOLEAN NOT NULL,
    "priceText" VARCHAR(60),
    "adultsOnly" BOOLEAN NOT NULL DEFAULT false,
    "familyFriendly" BOOLEAN NOT NULL DEFAULT false,
    "placeId" UUID,
    "venueName" VARCHAR(120),
    "address" VARCHAR(300),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "zip" CHAR(5),
    "neighborhood" VARCHAR(80),
    "chatRadiusMeters" INTEGER NOT NULL DEFAULT 150,
    "businessAccountId" UUID,
    "createdById" UUID,
    "firstStartsAt" TIMESTAMPTZ(3),
    "lastEndsAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "decisionReason" VARCHAR(300),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSession" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventImage" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "storageKey" VARCHAR(200) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventFollow" (
    "userId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFollow_pkey" PRIMARY KEY ("userId","eventId")
);

-- CreateTable
CREATE TABLE "EventAttendance" (
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAttendance_pkey" PRIMARY KEY ("userId","sessionId")
);

-- CreateTable
CREATE TABLE "EventChatMessage" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "authorId" UUID,
    "businessAccountId" UUID,
    "body" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_status_lastEndsAt_idx" ON "Event"("status", "lastEndsAt");

-- CreateIndex
CREATE INDEX "Event_placeId_idx" ON "Event"("placeId");

-- CreateIndex
CREATE INDEX "Event_businessAccountId_idx" ON "Event"("businessAccountId");

-- CreateIndex
CREATE INDEX "Event_createdById_idx" ON "Event"("createdById");

-- CreateIndex
CREATE INDEX "EventSession_startsAt_idx" ON "EventSession"("startsAt");

-- CreateIndex
CREATE INDEX "EventSession_endsAt_idx" ON "EventSession"("endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventSession_eventId_startsAt_key" ON "EventSession"("eventId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventImage_storageKey_key" ON "EventImage"("storageKey");

-- CreateIndex
CREATE INDEX "EventImage_eventId_position_idx" ON "EventImage"("eventId", "position");

-- CreateIndex
CREATE INDEX "EventFollow_eventId_idx" ON "EventFollow"("eventId");

-- CreateIndex
CREATE INDEX "EventAttendance_sessionId_idx" ON "EventAttendance"("sessionId");

-- CreateIndex
CREATE INDEX "EventChatMessage_sessionId_createdAt_idx" ON "EventChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "EventChatMessage_expiresAt_idx" ON "EventChatMessage"("expiresAt");

-- CreateIndex
CREATE INDEX "EventChatMessage_authorId_createdAt_idx" ON "EventChatMessage"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "EventChatMessage_businessAccountId_idx" ON "EventChatMessage"("businessAccountId");

-- CreateIndex
CREATE INDEX "Notification_eventId_idx" ON "Notification"("eventId") WHERE ("eventId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "Notification_eventSessionId_idx" ON "Notification"("eventSessionId") WHERE ("eventSessionId" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_event_once" ON "Notification"("userId", "eventSessionId", "type") WHERE ("eventSessionId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "Report_eventId_idx" ON "Report"("eventId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventSessionId_fkey" FOREIGN KEY ("eventSessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_businessAccountId_fkey" FOREIGN KEY ("businessAccountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventImage" ADD CONSTRAINT "EventImage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFollow" ADD CONSTRAINT "EventFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFollow" ADD CONSTRAINT "EventFollow_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_businessAccountId_fkey" FOREIGN KEY ("businessAccountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- D230: an event has a pin unless it's a user's suggestion (JaxSide sets the pin on approval).
ALTER TABLE "Event" ADD CONSTRAINT "Event_pin" CHECK (
  ("latitude" IS NULL) = ("longitude" IS NULL)
  AND ("status" = 'SUGGESTED' OR "latitude" IS NOT NULL));
ALTER TABLE "Event" ADD CONSTRAINT "Event_chat_radius" CHECK ("chatRadiusMeters" BETWEEN 50 AND 1600);
ALTER TABLE "Event" ADD CONSTRAINT "Event_free_price" CHECK (NOT ("free" AND "priceText" IS NOT NULL));
ALTER TABLE "Event" ADD CONSTRAINT "Event_business_place" CHECK ("hostKind" <> 'BUSINESS' OR "placeId" IS NOT NULL);

-- D230: a session ends after it starts, within a day.
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_order" CHECK (
  "endsAt" > "startsAt" AND "endsAt" <= "startsAt" + interval '24 hours');

-- D230: a chat line is a person's or the organizer's, never both.
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_one_author" CHECK (
  num_nonnulls("authorId", "businessAccountId") = 1);

-- D230: a report is about exactly one thing; an event is one of them now.
ALTER TABLE "Report" DROP CONSTRAINT "Report_one_target";
ALTER TABLE "Report" ADD CONSTRAINT "Report_one_target" CHECK (
  num_nonnulls("generalPostId", "businessPostId", "commentId", "photoId", "reportedUserId", "messageId", "cityTopicId", "adId", "eventId") = 1
  OR (num_nonnulls("generalPostId", "businessPostId", "commentId", "photoId", "reportedUserId", "messageId", "cityTopicId", "adId", "eventId") = 0
      AND "messageEvidence" IS NOT NULL));
