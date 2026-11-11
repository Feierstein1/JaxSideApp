-- CreateTable
CREATE TABLE "EventDailyStats" (
    "eventId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "attendees" INTEGER NOT NULL DEFAULT 0,
    "chatLines" INTEGER NOT NULL DEFAULT 0,
    "followers" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventDailyStats_pkey" PRIMARY KEY ("eventId","day")
);

-- AddForeignKey
ALTER TABLE "EventDailyStats" ADD CONSTRAINT "EventDailyStats_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;


