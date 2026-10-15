-- AlterTable
ALTER TABLE "EmailToken" ADD COLUMN     "codeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codeExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "codeHash" CHAR(64);
