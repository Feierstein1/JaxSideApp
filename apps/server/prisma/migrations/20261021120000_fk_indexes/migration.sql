-- P13.1 (DB review A1, A4, A5): foreign-key indexes, "@name" prefix index, tighter partial indexes.
-- The three "one open …" unique indexes are now declared in the schema (partialIndexes, D109), so they are not touched.


-- DropIndex
DROP INDEX "Comment_authorKind_createdAt_idx";

-- DropIndex
DROP INDEX "Message_conversationId_createdAt_idx";

-- DropIndex
DROP INDEX "Notification_userId_readAt_idx";

-- CreateIndex
CREATE INDEX "AppConfiguration_updatedById_idx" ON "AppConfiguration"("updatedById");

-- CreateIndex
CREATE INDEX "BusinessSubmission_placeId_idx" ON "BusinessSubmission"("placeId");

-- CreateIndex
CREATE INDEX "BusinessSubmission_reviewerId_idx" ON "BusinessSubmission"("reviewerId");

-- CreateIndex
CREATE INDEX "Comment_createdAt_idx" ON "Comment"("createdAt") WHERE ("authorKind" = 'GUEST');

-- CreateIndex
CREATE INDEX "ContactMessage_guestSessionId_idx" ON "ContactMessage"("guestSessionId");

-- CreateIndex
CREATE INDEX "ContactMessage_resolvedById_idx" ON "ContactMessage"("resolvedById");

-- CreateIndex
CREATE INDEX "LocationCheck_installationId_idx" ON "LocationCheck"("installationId");

-- CreateIndex
CREATE INDEX "LocationFlag_reviewedById_idx" ON "LocationFlag"("reviewedById");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_id_idx" ON "Message"("conversationId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "MessageHide_userId_idx" ON "MessageHide"("userId");

-- CreateIndex
CREATE INDEX "ModerationAction_generalPostId_idx" ON "ModerationAction"("generalPostId");

-- CreateIndex
CREATE INDEX "ModerationAction_businessPostId_idx" ON "ModerationAction"("businessPostId");

-- CreateIndex
CREATE INDEX "ModerationAction_commentId_idx" ON "ModerationAction"("commentId");

-- CreateIndex
CREATE INDEX "ModerationAction_photoId_idx" ON "ModerationAction"("photoId");

-- CreateIndex
CREATE INDEX "ModerationAction_reportId_idx" ON "ModerationAction"("reportId");

-- CreateIndex
CREATE INDEX "ModerationAction_submissionId_idx" ON "ModerationAction"("submissionId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId") WHERE ("readAt" IS NULL);

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");

-- CreateIndex
CREATE INDEX "OwnerClaim_decidedById_idx" ON "OwnerClaim"("decidedById");

-- CreateIndex
CREATE INDEX "PlaceRemoval_requesterId_idx" ON "PlaceRemoval"("requesterId");

-- CreateIndex
CREATE INDEX "PlaceRemoval_resolvedById_idx" ON "PlaceRemoval"("resolvedById");

-- CreateIndex
CREATE INDEX "Report_messageId_idx" ON "Report"("messageId");

-- CreateIndex
CREATE INDEX "Report_reporterUserId_createdAt_idx" ON "Report"("reporterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_reporterGuestId_idx" ON "Report"("reporterGuestId");

-- CreateIndex
CREATE INDEX "Report_resolvedById_idx" ON "Report"("resolvedById");

-- CreateIndex
CREATE INDEX "User_usernameNormalized_idx" ON "User"("usernameNormalized" varchar_pattern_ops);

-- CreateIndex
CREATE INDEX "UserAchievement_achievementId_idx" ON "UserAchievement"("achievementId");

-- CreateIndex
CREATE INDEX "Vote_generalPostId_idx" ON "Vote"("generalPostId");

-- CreateIndex
CREATE INDEX "Vote_businessPostId_idx" ON "Vote"("businessPostId");

-- CreateIndex
CREATE INDEX "Vote_commentId_idx" ON "Vote"("commentId");

