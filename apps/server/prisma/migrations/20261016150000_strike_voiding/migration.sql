-- AlterTable
ALTER TABLE "ModerationAction" ADD COLUMN     "voidReason" VARCHAR(500),
ADD COLUMN     "voidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "voidedById" UUID;

