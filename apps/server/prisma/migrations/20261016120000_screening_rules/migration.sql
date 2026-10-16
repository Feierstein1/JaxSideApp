-- CreateEnum
CREATE TYPE "ScreeningAction" AS ENUM ('WARN', 'HOLD', 'BLOCK');

-- CreateEnum
CREATE TYPE "ScreeningMatch" AS ENUM ('WORD', 'CONTAINS');

-- CreateEnum
CREATE TYPE "ScreeningCategory" AS ENUM ('SLUR', 'THREAT', 'SEXUAL', 'HARASSMENT', 'DOXXING', 'SPAM', 'OTHER');

-- CreateTable
CREATE TABLE "ScreeningRule" (
    "id" UUID NOT NULL,
    "term" VARCHAR(100) NOT NULL,
    "match" "ScreeningMatch" NOT NULL DEFAULT 'WORD',
    "action" "ScreeningAction" NOT NULL,
    "category" "ScreeningCategory" NOT NULL,
    "message" VARCHAR(300),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScreeningRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningRule_term_match_key" ON "ScreeningRule"("term", "match");


-- Hand-written: a rule must have a real term.
ALTER TABLE "ScreeningRule" ADD CONSTRAINT "ScreeningRule_term_not_blank" CHECK (length(btrim(term)) > 0);
