-- P13.8 (D108): split the User row, which every request reads.
-- - Admin 2FA (secret, enabled time, last accepted step) → "AdminCredential" (admins only).
-- - Private preferences (radius, "hide my posts from friends") → "UserSettings" (no row = defaults).
-- - The account color is public profile data shown with every post, chat and notification, so it
--   goes to "Profile" next to the bio and avatar, which those queries already join (D108 note).
-- Data is copied before the old columns are dropped.

-- 1. New tables and the Profile column.
CREATE TABLE "UserSettings" (
    "userId" UUID NOT NULL,
    "generalRadiusMiles" DOUBLE PRECISION,
    "businessRadiusMiles" DOUBLE PRECISION,
    "hidePostsFromFriends" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "AdminCredential" (
    "userId" UUID NOT NULL,
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMPTZ(3),
    "totpLastStep" INTEGER,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdminCredential_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminCredential" ADD CONSTRAINT "AdminCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Profile" ADD COLUMN "color" VARCHAR(20) NOT NULL DEFAULT 'teal';

-- 2. Copy the data. Every user gets a Profile row (the color lives there); settings and 2FA
--    rows only where they hold something.
INSERT INTO "Profile" ("userId", "updatedAt")
SELECT u.id, now() FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "Profile" p WHERE p."userId" = u.id);

UPDATE "Profile" p SET color = u."profileColor" FROM "User" u WHERE u.id = p."userId";

INSERT INTO "UserSettings" ("userId", "generalRadiusMiles", "businessRadiusMiles", "hidePostsFromFriends", "updatedAt")
SELECT id, "generalRadiusMiles", "businessRadiusMiles", "hidePostsFromFriends", now() FROM "User"
WHERE "generalRadiusMiles" IS NOT NULL OR "businessRadiusMiles" IS NOT NULL OR "hidePostsFromFriends";

INSERT INTO "AdminCredential" ("userId", "totpSecretEnc", "totpEnabledAt", "totpLastStep", "updatedAt")
SELECT id, "totpSecretEnc", "totpEnabledAt", "totpLastStep", now() FROM "User"
WHERE "totpSecretEnc" IS NOT NULL OR "totpEnabledAt" IS NOT NULL;

-- 3. Drop the old columns.
ALTER TABLE "User" DROP COLUMN "businessRadiusMiles",
DROP COLUMN "generalRadiusMiles",
DROP COLUMN "hidePostsFromFriends",
DROP COLUMN "profileColor",
DROP COLUMN "totpEnabledAt",
DROP COLUMN "totpLastStep",
DROP COLUMN "totpSecretEnc";
