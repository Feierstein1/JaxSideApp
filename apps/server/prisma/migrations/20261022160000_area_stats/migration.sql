-- P14 (D116): anonymous area statistics. Per-person rows (AreaVisit) carry no account ID and no
-- coordinates and are deleted once counted; everything kept is a count. See schema.prisma.

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "areaStatsOptOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ZipArea" (
    "zip" CHAR(5) NOT NULL,
    "geom" geography(MultiPolygon, 4326),

    CONSTRAINT "ZipArea_pkey" PRIMARY KEY ("zip")
);

-- CreateTable
CREATE TABLE "VisitKey" (
    "period" VARCHAR(20) NOT NULL,
    "keyWrapped" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitKey_pkey" PRIMARY KEY ("period")
);

-- CreateTable
CREATE TABLE "AreaVisit" (
    "day" DATE NOT NULL,
    "zip" CHAR(5) NOT NULL,
    "visitorMonth" BYTEA NOT NULL,
    "visitorWeek" BYTEA NOT NULL,
    "dayparts" SMALLINT NOT NULL,

    CONSTRAINT "AreaVisit_pkey" PRIMARY KEY ("day","zip","visitorMonth")
);

-- CreateTable
CREATE TABLE "AreaStatsDaily" (
    "day" DATE NOT NULL,
    "zip" CHAR(5) NOT NULL,
    "visitors" INTEGER NOT NULL,
    "morning" INTEGER NOT NULL,
    "afternoon" INTEGER NOT NULL,
    "evening" INTEGER NOT NULL,
    "night" INTEGER NOT NULL,
    "newThisMonth" INTEGER NOT NULL,

    CONSTRAINT "AreaStatsDaily_pkey" PRIMARY KEY ("day","zip")
);

-- CreateTable
CREATE TABLE "AreaStatsWeekly" (
    "weekStart" DATE NOT NULL,
    "zip" CHAR(5) NOT NULL,
    "visitors" INTEGER NOT NULL,

    CONSTRAINT "AreaStatsWeekly_pkey" PRIMARY KEY ("weekStart","zip")
);

-- CreateTable
CREATE TABLE "AreaStatsMonthly" (
    "month" DATE NOT NULL,
    "zip" CHAR(5) NOT NULL,
    "visitors" INTEGER NOT NULL,
    "visitDays" INTEGER NOT NULL,

    CONSTRAINT "AreaStatsMonthly_pkey" PRIMARY KEY ("month","zip")
);

-- CreateTable
CREATE TABLE "AreaFlowDaily" (
    "day" DATE NOT NULL,
    "zipA" CHAR(5) NOT NULL,
    "zipB" CHAR(5) NOT NULL,
    "visitors" INTEGER NOT NULL,

    CONSTRAINT "AreaFlowDaily_pkey" PRIMARY KEY ("day","zipA","zipB")
);

-- CreateTable
CREATE TABLE "PlaceStatsDaily" (
    "day" DATE NOT NULL,
    "placeId" UUID NOT NULL,
    "posts" INTEGER NOT NULL,
    "comments" INTEGER NOT NULL,
    "people" INTEGER NOT NULL,
    "favorites" INTEGER NOT NULL,
    "votes" INTEGER NOT NULL,

    CONSTRAINT "PlaceStatsDaily_pkey" PRIMARY KEY ("day","placeId")
);

-- CreateTable
CREATE TABLE "StatsRollup" (
    "kind" VARCHAR(10) NOT NULL,
    "period" DATE NOT NULL,

    CONSTRAINT "StatsRollup_pkey" PRIMARY KEY ("kind","period")
);

-- CreateIndex
CREATE INDEX "ZipArea_geom_idx" ON "ZipArea" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "PlaceStatsDaily_placeId_idx" ON "PlaceStatsDaily"("placeId");

-- AddForeignKey
ALTER TABLE "PlaceStatsDaily" ADD CONSTRAINT "PlaceStatsDaily_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

