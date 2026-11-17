-- D260: times each ad was served, by Jacksonville day and the reader's ZIP (counts only).
-- CreateTable
CREATE TABLE "AdServeStats" (
    "adId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "zip" VARCHAR(5) NOT NULL,
    "serves" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdServeStats_pkey" PRIMARY KEY ("adId","day","zip")
);

-- CreateIndex
CREATE INDEX "AdServeStats_zip_adId_idx" ON "AdServeStats"("zip", "adId");

-- AddForeignKey
ALTER TABLE "AdServeStats" ADD CONSTRAINT "AdServeStats_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;


