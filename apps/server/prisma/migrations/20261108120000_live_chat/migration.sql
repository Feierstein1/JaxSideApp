-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" UUID NOT NULL,
    "cellKey" VARCHAR(24) NOT NULL,
    "zip" CHAR(5),
    "neighborhood" VARCHAR(80),
    "direction" VARCHAR(2),
    "displayName" VARCHAR(80),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatPresence" (
    "userId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatPresence_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoom_cellKey_key" ON "ChatRoom"("cellKey");

-- CreateIndex
CREATE INDEX "ChatRoom_lastActivityAt_idx" ON "ChatRoom"("lastActivityAt");

-- CreateIndex
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_expiresAt_idx" ON "ChatMessage"("expiresAt");

-- CreateIndex
CREATE INDEX "ChatMessage_authorId_createdAt_idx" ON "ChatMessage"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatPresence_roomId_lastSeenAt_idx" ON "ChatPresence"("roomId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ChatPresence_lastSeenAt_idx" ON "ChatPresence"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPresence" ADD CONSTRAINT "ChatPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPresence" ADD CONSTRAINT "ChatPresence_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
