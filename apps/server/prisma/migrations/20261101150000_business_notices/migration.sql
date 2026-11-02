-- CreateEnum
CREATE TYPE "BusinessNoticeKind" AS ENUM ('PLACE_ADDED', 'PLACE_REMOVED', 'AD_APPROVED', 'AD_REJECTED', 'FROM_JAXSIDE');

-- AlterTable
ALTER TABLE "BusinessAccount" ADD COLUMN     "emailNotices" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "noticesEmailedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "BusinessPlaceAccess" ADD COLUMN     "inboxSeenAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "BusinessNotice" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "placeId" UUID,
    "kind" "BusinessNoticeKind" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(500),
    "link" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "BusinessNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessNotice_accountId_createdAt_idx" ON "BusinessNotice"("accountId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BusinessNotice_accountId_idx" ON "BusinessNotice"("accountId") WHERE ("readAt" IS NULL);

-- CreateIndex
CREATE INDEX "BusinessNotice_placeId_idx" ON "BusinessNotice"("placeId");

-- AddForeignKey
ALTER TABLE "BusinessNotice" ADD CONSTRAINT "BusinessNotice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessNotice" ADD CONSTRAINT "BusinessNotice_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- B1.8: notice links stay on the business website (a path, never an outside address).
ALTER TABLE "BusinessNotice" ADD CONSTRAINT "BusinessNotice_link_path"
  CHECK ("link" IS NULL OR ("link" LIKE '/%' AND "link" NOT LIKE '//%'));
