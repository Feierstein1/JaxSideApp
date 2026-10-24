-- D123: weekly polls. Votes are coded per poll and deleted (key destroyed) once counted.
-- CreateTable
CREATE TABLE "Poll" (
    "id" UUID NOT NULL,
    "question" VARCHAR(200) NOT NULL,
    "details" VARCHAR(500),
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "closesAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "finalizedAt" TIMESTAMPTZ(3),
    "voterCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollChoice" (
    "id" UUID NOT NULL,
    "pollId" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "PollChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollKey" (
    "pollId" UUID NOT NULL,
    "keyWrapped" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollKey_pkey" PRIMARY KEY ("pollId")
);

-- CreateTable
CREATE TABLE "PollBallot" (
    "pollId" UUID NOT NULL,
    "voterCode" BYTEA NOT NULL,
    "choiceId" UUID NOT NULL,
    "zip" VARCHAR(5) NOT NULL DEFAULT '',

    CONSTRAINT "PollBallot_pkey" PRIMARY KEY ("pollId","voterCode")
);

-- CreateTable
CREATE TABLE "PollTally" (
    "pollId" UUID NOT NULL,
    "choiceId" UUID NOT NULL,
    "zip" VARCHAR(5) NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL,

    CONSTRAINT "PollTally_pkey" PRIMARY KEY ("pollId","choiceId","zip")
);

-- CreateIndex
CREATE INDEX "Poll_opensAt_closesAt_idx" ON "Poll"("opensAt", "closesAt");

-- CreateIndex
CREATE INDEX "Poll_finalizedAt_closesAt_idx" ON "Poll"("finalizedAt", "closesAt");

-- CreateIndex
CREATE INDEX "Poll_createdById_idx" ON "Poll"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "PollChoice_pollId_position_key" ON "PollChoice"("pollId", "position");

-- CreateIndex
CREATE INDEX "PollBallot_choiceId_idx" ON "PollBallot"("choiceId");

-- CreateIndex
CREATE INDEX "PollTally_choiceId_idx" ON "PollTally"("choiceId");

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollChoice" ADD CONSTRAINT "PollChoice_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollKey" ADD CONSTRAINT "PollKey_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollBallot" ADD CONSTRAINT "PollBallot_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollBallot" ADD CONSTRAINT "PollBallot_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "PollChoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollTally" ADD CONSTRAINT "PollTally_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollTally" ADD CONSTRAINT "PollTally_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "PollChoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- D123: a poll closes after it opens; totals are never negative.
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_closes_after_opens" CHECK ("closesAt" > "opensAt");
ALTER TABLE "PollTally" ADD CONSTRAINT "PollTally_count_positive" CHECK ("count" > 0);
