-- AlterTable
ALTER TABLE "EmailToken" ADD COLUMN     "newEmailEnc" BYTEA;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ageCutoffYear" SMALLINT,
ADD COLUMN     "dekWrapped" BYTEA,
ADD COLUMN     "emailEnc" BYTEA,
ADD COLUMN     "emailIndex" CHAR(64),
ADD COLUMN     "legalHoldAt" TIMESTAMPTZ(3),
ADD COLUMN     "legalHoldNote" VARCHAR(500);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailIndex_key" ON "User"("emailIndex");

