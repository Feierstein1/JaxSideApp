-- Extensions (P1.8): PostGIS for geography, pg_trgm for place-name search.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('MOBILE', 'ADMIN');

-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'PASSWORD_RESET', 'EMAIL_CHANGE');

-- CreateEnum
CREATE TYPE "GuestStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'BANNED');

-- CreateEnum
CREATE TYPE "AuthorKind" AS ENUM ('USER', 'GUEST');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('VISIBLE', 'HELD_FOR_REVIEW', 'REMOVED', 'DELETED');

-- CreateEnum
CREATE TYPE "PlaceStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DUPLICATE', 'MERGED');

-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('PENDING_UPLOAD', 'PROCESSING', 'ACTIVE', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'THREAT', 'HATE', 'DOXXING', 'SEXUAL_CONTENT', 'CHILD_SAFETY', 'IMPERSONATION', 'SCAM', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('NOTE', 'WARN', 'SUSPEND', 'BAN', 'UNBAN', 'REMOVE_CONTENT', 'RESTORE_CONTENT', 'ADJUST_RATE_LIMIT', 'LOCATION_RESTRICT');

-- CreateEnum
CREATE TYPE "DeletionStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LocationCheckResult" AS ENUM ('ALLOWED', 'DENIED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" VARCHAR(20) NOT NULL,
    "usernameNormalized" VARCHAR(20) NOT NULL,
    "usernameChangedAt" TIMESTAMPTZ(3),
    "email" VARCHAR(254) NOT NULL,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "passwordHash" TEXT NOT NULL,
    "birthYear" SMALLINT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedUntil" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "tosAcceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "tosVersion" VARCHAR(20) NOT NULL,
    "adultConfirmedAt" TIMESTAMPTZ(3) NOT NULL,
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMPTZ(3),
    "generalRadiusMiles" DOUBLE PRECISION,
    "businessRadiusMiles" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsernameHistory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "username" VARCHAR(20) NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsernameHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "SessionKind" NOT NULL,
    "csrfTokenHash" CHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "EmailTokenPurpose" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "newEmail" VARCHAR(254),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bannedAt" TIMESTAMPTZ(3),
    "integrityStatus" VARCHAR(32),

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "installationId" UUID NOT NULL,
    "status" "GuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "bannedAt" TIMESTAMPTZ(3),

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "userId" UUID NOT NULL,
    "bio" VARCHAR(300),
    "avatarPhotoId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ServiceArea" (
    "id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "geom" geography(MultiPolygon, 4326),
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationCheck" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "guestSessionId" UUID,
    "installationId" UUID,
    "action" VARCHAR(40) NOT NULL,
    "point" geography(Point, 4326),
    "accuracyMeters" DOUBLE PRECISION NOT NULL,
    "readingAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "LocationCheckResult" NOT NULL,
    "reason" VARCHAR(40),

    CONSTRAINT "LocationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessPlace" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "nameNormalized" VARCHAR(200) NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "address" VARCHAR(300),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point, 4326),
    "status" "PlaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceName" VARCHAR(40) NOT NULL,
    "sourceId" VARCHAR(100) NOT NULL,
    "attribution" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BusinessPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSubmission" (
    "id" UUID NOT NULL,
    "submitterId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "nameNormalized" VARCHAR(200) NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "address" VARCHAR(300),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point, 4326),
    "notes" VARCHAR(1000),
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "decisionReason" VARCHAR(500),
    "reviewerId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "placeId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BusinessSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoritePlace" (
    "userId" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoritePlace_pkey" PRIMARY KEY ("userId","placeId")
);

-- CreateTable
CREATE TABLE "GeneralPost" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "location" geography(Point, 4326),
    "status" "ContentStatus" NOT NULL DEFAULT 'VISIBLE',
    "score" INTEGER NOT NULL DEFAULT 0,
    "upCount" INTEGER NOT NULL DEFAULT 0,
    "downCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "editedAt" TIMESTAMPTZ(3),

    CONSTRAINT "GeneralPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessPost" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'VISIBLE',
    "score" INTEGER NOT NULL DEFAULT 0,
    "upCount" INTEGER NOT NULL DEFAULT 0,
    "downCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "editedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BusinessPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "generalPostId" UUID,
    "businessPostId" UUID,
    "parentCommentId" UUID,
    "depth" SMALLINT NOT NULL DEFAULT 0,
    "authorKind" "AuthorKind" NOT NULL,
    "authorUserId" UUID,
    "authorGuestId" UUID,
    "body" VARCHAR(1000) NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'VISIBLE',
    "score" INTEGER NOT NULL DEFAULT 0,
    "upCount" INTEGER NOT NULL DEFAULT 0,
    "downCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "editedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" UUID NOT NULL,
    "voterId" UUID NOT NULL,
    "generalPostId" UUID,
    "businessPostId" UUID,
    "commentId" UUID,
    "value" SMALLINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "storageKey" VARCHAR(200),
    "quarantineKey" VARCHAR(200),
    "status" "PhotoStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "mimeType" VARCHAR(40),
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "generalPostId" UUID,
    "businessPostId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "icon" VARCHAR(50) NOT NULL,
    "criteria" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "userId" UUID NOT NULL,
    "achievementId" UUID NOT NULL,
    "awardedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("userId","achievementId")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "reporterUserId" UUID,
    "reporterGuestId" UUID,
    "generalPostId" UUID,
    "businessPostId" UUID,
    "commentId" UUID,
    "photoId" UUID,
    "reportedUserId" UUID,
    "reason" "ReportReason" NOT NULL,
    "details" VARCHAR(1000),
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "action" "ModerationActionType" NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "internalNote" VARCHAR(2000),
    "durationHours" INTEGER,
    "expiresAt" TIMESTAMPTZ(3),
    "targetUserId" UUID,
    "targetGuestId" UUID,
    "targetInstallationId" UUID,
    "generalPostId" UUID,
    "businessPostId" UUID,
    "commentId" UUID,
    "photoId" UUID,
    "submissionId" UUID,
    "reportId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "targetType" VARCHAR(40) NOT NULL,
    "targetId" VARCHAR(64),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletion" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "DeletionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAfter" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AccountDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfiguration" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "description" VARCHAR(300),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "AppConfiguration_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "key" VARCHAR(200) NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_usernameNormalized_key" ON "User"("usernameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "UsernameHistory_userId_changedAt_idx" ON "UsernameHistory"("userId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_purpose_idx" ON "EmailToken"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_tokenHash_key" ON "GuestSession"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestSession_installationId_idx" ON "GuestSession"("installationId");

-- CreateIndex
CREATE INDEX "GuestSession_status_expiresAt_idx" ON "GuestSession"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_avatarPhotoId_key" ON "Profile"("avatarPhotoId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceArea_key_key" ON "ServiceArea"("key");

-- CreateIndex
CREATE INDEX "ServiceArea_geom_idx" ON "ServiceArea" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "LocationCheck_userId_receivedAt_idx" ON "LocationCheck"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "LocationCheck_guestSessionId_receivedAt_idx" ON "LocationCheck"("guestSessionId", "receivedAt");

-- CreateIndex
CREATE INDEX "LocationCheck_receivedAt_idx" ON "LocationCheck"("receivedAt");

-- CreateIndex
CREATE INDEX "BusinessPlace_location_idx" ON "BusinessPlace" USING GIST ("location");

-- CreateIndex
CREATE INDEX "BusinessPlace_nameNormalized_idx" ON "BusinessPlace" USING GIN ("nameNormalized" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "BusinessPlace_status_category_idx" ON "BusinessPlace"("status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessPlace_sourceName_sourceId_key" ON "BusinessPlace"("sourceName", "sourceId");

-- CreateIndex
CREATE INDEX "BusinessSubmission_status_createdAt_idx" ON "BusinessSubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessSubmission_submitterId_createdAt_idx" ON "BusinessSubmission"("submitterId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessSubmission_location_idx" ON "BusinessSubmission" USING GIST ("location");

-- CreateIndex
CREATE INDEX "FavoritePlace_placeId_idx" ON "FavoritePlace"("placeId");

-- CreateIndex
CREATE INDEX "GeneralPost_location_idx" ON "GeneralPost" USING GIST ("location");

-- CreateIndex
CREATE INDEX "GeneralPost_status_createdAt_id_idx" ON "GeneralPost"("status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "GeneralPost_authorId_createdAt_idx" ON "GeneralPost"("authorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BusinessPost_placeId_status_createdAt_id_idx" ON "BusinessPost"("placeId", "status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "BusinessPost_authorId_createdAt_idx" ON "BusinessPost"("authorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Comment_generalPostId_createdAt_id_idx" ON "Comment"("generalPostId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Comment_businessPostId_createdAt_id_idx" ON "Comment"("businessPostId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Comment_parentCommentId_idx" ON "Comment"("parentCommentId");

-- CreateIndex
CREATE INDEX "Comment_authorUserId_createdAt_idx" ON "Comment"("authorUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Comment_authorGuestId_idx" ON "Comment"("authorGuestId");

-- CreateIndex
CREATE INDEX "Comment_authorKind_createdAt_idx" ON "Comment"("authorKind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_voterId_generalPostId_key" ON "Vote"("voterId", "generalPostId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_voterId_businessPostId_key" ON "Vote"("voterId", "businessPostId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_voterId_commentId_key" ON "Vote"("voterId", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_storageKey_key" ON "Photo"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_quarantineKey_key" ON "Photo"("quarantineKey");

-- CreateIndex
CREATE INDEX "Photo_uploaderId_createdAt_idx" ON "Photo"("uploaderId", "createdAt");

-- CreateIndex
CREATE INDEX "Photo_generalPostId_idx" ON "Photo"("generalPostId");

-- CreateIndex
CREATE INDEX "Photo_businessPostId_idx" ON "Photo"("businessPostId");

-- CreateIndex
CREATE INDEX "Photo_status_createdAt_idx" ON "Photo"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_key_key" ON "Achievement"("key");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_generalPostId_idx" ON "Report"("generalPostId");

-- CreateIndex
CREATE INDEX "Report_businessPostId_idx" ON "Report"("businessPostId");

-- CreateIndex
CREATE INDEX "Report_commentId_idx" ON "Report"("commentId");

-- CreateIndex
CREATE INDEX "Report_photoId_idx" ON "Report"("photoId");

-- CreateIndex
CREATE INDEX "Report_reportedUserId_idx" ON "Report"("reportedUserId");

-- CreateIndex
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

-- CreateIndex
CREATE INDEX "ModerationAction_targetUserId_createdAt_idx" ON "ModerationAction"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAction_targetGuestId_idx" ON "ModerationAction"("targetGuestId");

-- CreateIndex
CREATE INDEX "ModerationAction_targetInstallationId_idx" ON "ModerationAction"("targetInstallationId");

-- CreateIndex
CREATE INDEX "ModerationAction_adminId_createdAt_idx" ON "ModerationAction"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AccountDeletion_status_purgeAfter_idx" ON "AccountDeletion"("status", "purgeAfter");

-- CreateIndex
CREATE INDEX "AccountDeletion_userId_idx" ON "AccountDeletion"("userId");

-- CreateIndex
CREATE INDEX "RateLimitCounter_expiresAt_idx" ON "RateLimitCounter"("expiresAt");

-- AddForeignKey
ALTER TABLE "UsernameHistory" ADD CONSTRAINT "UsernameHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_avatarPhotoId_fkey" FOREIGN KEY ("avatarPhotoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationCheck" ADD CONSTRAINT "LocationCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationCheck" ADD CONSTRAINT "LocationCheck_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationCheck" ADD CONSTRAINT "LocationCheck_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoritePlace" ADD CONSTRAINT "FavoritePlace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoritePlace" ADD CONSTRAINT "FavoritePlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneralPost" ADD CONSTRAINT "GeneralPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPost" ADD CONSTRAINT "BusinessPost_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPost" ADD CONSTRAINT "BusinessPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_generalPostId_fkey" FOREIGN KEY ("generalPostId") REFERENCES "GeneralPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_businessPostId_fkey" FOREIGN KEY ("businessPostId") REFERENCES "BusinessPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorGuestId_fkey" FOREIGN KEY ("authorGuestId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_generalPostId_fkey" FOREIGN KEY ("generalPostId") REFERENCES "GeneralPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_businessPostId_fkey" FOREIGN KEY ("businessPostId") REFERENCES "BusinessPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_generalPostId_fkey" FOREIGN KEY ("generalPostId") REFERENCES "GeneralPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_businessPostId_fkey" FOREIGN KEY ("businessPostId") REFERENCES "BusinessPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterGuestId_fkey" FOREIGN KEY ("reporterGuestId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_generalPostId_fkey" FOREIGN KEY ("generalPostId") REFERENCES "GeneralPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_businessPostId_fkey" FOREIGN KEY ("businessPostId") REFERENCES "BusinessPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_targetGuestId_fkey" FOREIGN KEY ("targetGuestId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_targetInstallationId_fkey" FOREIGN KEY ("targetInstallationId") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_generalPostId_fkey" FOREIGN KEY ("generalPostId") REFERENCES "GeneralPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_businessPostId_fkey" FOREIGN KEY ("businessPostId") REFERENCES "BusinessPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "BusinessSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletion" ADD CONSTRAINT "AccountDeletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppConfiguration" ADD CONSTRAINT "AppConfiguration_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- Integrity constraints Prisma cannot express (D5, D6, D7). Hand-written.
-- ─────────────────────────────────────────────────────────────────────

-- Required geography columns (Prisma marks them optional because they are Unsupported).
ALTER TABLE "ServiceArea"        ADD CONSTRAINT "ServiceArea_geom_required"         CHECK ("geom" IS NOT NULL);
ALTER TABLE "LocationCheck"      ADD CONSTRAINT "LocationCheck_point_required"      CHECK ("point" IS NOT NULL);
ALTER TABLE "BusinessPlace"      ADD CONSTRAINT "BusinessPlace_location_required"   CHECK ("location" IS NOT NULL);
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_location_required" CHECK ("location" IS NOT NULL);
ALTER TABLE "GeneralPost"        ADD CONSTRAINT "GeneralPost_location_required"     CHECK ("location" IS NOT NULL);

-- Coordinate ranges.
ALTER TABLE "BusinessPlace"      ADD CONSTRAINT "BusinessPlace_latlng_range"
  CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_latlng_range"
  CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "LocationCheck"      ADD CONSTRAINT "LocationCheck_accuracy_nonneg" CHECK ("accuracyMeters" >= 0);

-- User fields.
ALTER TABLE "User" ADD CONSTRAINT "User_birthYear_range" CHECK ("birthYear" BETWEEN 1900 AND 2100);
ALTER TABLE "User" ADD CONSTRAINT "User_radius_positive"
  CHECK (("generalRadiusMiles" IS NULL OR "generalRadiusMiles" > 0)
     AND ("businessRadiusMiles" IS NULL OR "businessRadiusMiles" > 0));

-- LocationCheck actor: exactly one of user / guest.
ALTER TABLE "LocationCheck" ADD CONSTRAINT "LocationCheck_one_actor"
  CHECK (num_nonnulls("userId", "guestSessionId") = 1);

-- Comment: on exactly one post; author matches authorKind.
-- A GUEST comment may have a null authorGuestId after guest data is purged (§16, D17).
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_one_post"
  CHECK (num_nonnulls("generalPostId", "businessPostId") = 1);
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_author_kind"
  CHECK (("authorKind" = 'USER'  AND "authorUserId" IS NOT NULL AND "authorGuestId" IS NULL)
      OR ("authorKind" = 'GUEST' AND "authorUserId" IS NULL));
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_depth_nonneg" CHECK ("depth" >= 0);
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_not_own_parent" CHECK ("parentCommentId" <> "id");

-- Vote: exactly one target; value is +1 or -1 (D6).
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_one_target"
  CHECK (num_nonnulls("generalPostId", "businessPostId", "commentId") = 1);
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_value" CHECK ("value" IN (-1, 1));

-- Photo: attached to at most one post (avatars link from Profile).
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_at_most_one_post"
  CHECK (num_nonnulls("generalPostId", "businessPostId") <= 1);

-- Report: exactly one target; at most one reporter (may become 0 after purge).
ALTER TABLE "Report" ADD CONSTRAINT "Report_one_target"
  CHECK (num_nonnulls("generalPostId", "businessPostId", "commentId", "photoId", "reportedUserId") = 1);
ALTER TABLE "Report" ADD CONSTRAINT "Report_at_most_one_reporter"
  CHECK (num_nonnulls("reporterUserId", "reporterGuestId") <= 1);

-- No self-blocks.
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_not_self" CHECK ("blockerId" <> "blockedId");

-- Server-maintained counters never go negative.
ALTER TABLE "GeneralPost"  ADD CONSTRAINT "GeneralPost_counts_nonneg"
  CHECK ("upCount" >= 0 AND "downCount" >= 0 AND "commentCount" >= 0);
ALTER TABLE "BusinessPost" ADD CONSTRAINT "BusinessPost_counts_nonneg"
  CHECK ("upCount" >= 0 AND "downCount" >= 0 AND "commentCount" >= 0);
ALTER TABLE "Comment"      ADD CONSTRAINT "Comment_counts_nonneg"
  CHECK ("upCount" >= 0 AND "downCount" >= 0);
ALTER TABLE "RateLimitCounter" ADD CONSTRAINT "RateLimitCounter_count_nonneg" CHECK ("count" >= 0);
