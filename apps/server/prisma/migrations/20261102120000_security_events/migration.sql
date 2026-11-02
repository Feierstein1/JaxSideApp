-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "userId" UUID,
    "ipCode" VARCHAR(16),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityEvent_kind_createdAt_idx" ON "SecurityEvent"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

