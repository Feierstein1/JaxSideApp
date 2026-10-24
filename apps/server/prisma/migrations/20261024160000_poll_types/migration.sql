-- D124: poll types (Yes / No, Pick one, Pick several, Rating scale) and topics. Votes move to
-- one row per voter (PollVoter: code + ZIP) and one per answer picked (PollSelection). Existing
-- votes are copied over; closed polls get their voter totals from the old (one-answer) counts.

-- CreateEnum
CREATE TYPE "PollKind" AS ENUM ('YES_NO', 'SINGLE', 'MULTI', 'SCALE');

-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "kind" "PollKind" NOT NULL DEFAULT 'SINGLE',
ADD COLUMN     "maxPicks" SMALLINT,
ADD COLUMN     "scaleHighLabel" VARCHAR(40),
ADD COLUMN     "scaleLowLabel" VARCHAR(40),
ADD COLUMN     "topic" VARCHAR(30) NOT NULL DEFAULT 'other';

-- AlterTable
ALTER TABLE "PollChoice" ADD COLUMN     "value" SMALLINT;

-- CreateTable
CREATE TABLE "PollVoter" (
    "pollId" UUID NOT NULL,
    "voterCode" BYTEA NOT NULL,
    "zip" VARCHAR(5) NOT NULL DEFAULT '',

    CONSTRAINT "PollVoter_pkey" PRIMARY KEY ("pollId","voterCode")
);

-- CreateTable
CREATE TABLE "PollSelection" (
    "pollId" UUID NOT NULL,
    "voterCode" BYTEA NOT NULL,
    "choiceId" UUID NOT NULL,

    CONSTRAINT "PollSelection_pkey" PRIMARY KEY ("pollId","voterCode","choiceId")
);

-- CreateTable
CREATE TABLE "PollVoterTally" (
    "pollId" UUID NOT NULL,
    "zip" VARCHAR(5) NOT NULL DEFAULT '',
    "voters" INTEGER NOT NULL,

    CONSTRAINT "PollVoterTally_pkey" PRIMARY KEY ("pollId","zip")
);

-- Copy open votes (each old row was one person with one answer).
INSERT INTO "PollVoter" ("pollId", "voterCode", zip)
  SELECT "pollId", "voterCode", zip FROM "PollBallot";
INSERT INTO "PollSelection" ("pollId", "voterCode", "choiceId")
  SELECT "pollId", "voterCode", "choiceId" FROM "PollBallot";
-- Closed polls: one answer per person, so voters per ZIP = the sum of the counts.
INSERT INTO "PollVoterTally" ("pollId", zip, voters)
  SELECT "pollId", zip, sum(count)::int FROM "PollTally" GROUP BY "pollId", zip;

-- DropTable
ALTER TABLE "PollBallot" DROP CONSTRAINT "PollBallot_choiceId_fkey";
ALTER TABLE "PollBallot" DROP CONSTRAINT "PollBallot_pollId_fkey";
DROP TABLE "PollBallot";

-- CreateIndex
CREATE INDEX "PollSelection_choiceId_idx" ON "PollSelection"("choiceId");

-- CreateIndex
CREATE INDEX "Poll_topic_closesAt_idx" ON "Poll"("topic", "closesAt");

-- AddForeignKey
ALTER TABLE "PollVoter" ADD CONSTRAINT "PollVoter_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollSelection" ADD CONSTRAINT "PollSelection_pollId_voterCode_fkey" FOREIGN KEY ("pollId", "voterCode") REFERENCES "PollVoter"("pollId", "voterCode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollSelection" ADD CONSTRAINT "PollSelection_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "PollChoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVoterTally" ADD CONSTRAINT "PollVoterTally_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the app also checks: up to N picks is at least 2; scale answers are 1–5; totals positive.
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_maxPicks_range" CHECK ("maxPicks" IS NULL OR "maxPicks" >= 2);
ALTER TABLE "PollChoice" ADD CONSTRAINT "PollChoice_value_range" CHECK ("value" IS NULL OR "value" BETWEEN 1 AND 5);
ALTER TABLE "PollVoterTally" ADD CONSTRAINT "PollVoterTally_voters_positive" CHECK ("voters" > 0);
