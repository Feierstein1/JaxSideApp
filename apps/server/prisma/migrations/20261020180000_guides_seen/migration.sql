-- CreateTable
CREATE TABLE "GuideSeen" (
    "userId" UUID NOT NULL,
    "guideKey" VARCHAR(40) NOT NULL,
    "version" INTEGER NOT NULL,
    "seenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideSeen_pkey" PRIMARY KEY ("userId","guideKey")
);

-- AddForeignKey
ALTER TABLE "GuideSeen" ADD CONSTRAINT "GuideSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

