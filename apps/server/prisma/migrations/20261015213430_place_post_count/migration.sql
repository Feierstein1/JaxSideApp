-- AlterTable
ALTER TABLE "BusinessPlace" ADD COLUMN     "postCount" INTEGER NOT NULL DEFAULT 0;


-- Hand-written: counters never go negative.
ALTER TABLE "BusinessPlace" ADD CONSTRAINT "BusinessPlace_postCount_nonneg" CHECK ("postCount" >= 0);
