-- D230: an ad can promote an event; an event organizer has no place, so an ad needs a place,
-- an event, or both.
ALTER TABLE "Ad" ADD COLUMN "eventId" UUID,
ALTER COLUMN "placeId" DROP NOT NULL;

CREATE INDEX "Ad_eventId_idx" ON "Ad"("eventId");

ALTER TABLE "Ad" ADD CONSTRAINT "Ad_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ad" ADD CONSTRAINT "Ad_place_or_event" CHECK ("placeId" IS NOT NULL OR "eventId" IS NOT NULL);
