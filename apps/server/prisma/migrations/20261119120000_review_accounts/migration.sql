-- D268: App Store / Google Play review accounts (set only in the admin portal).
ALTER TABLE "User" ADD COLUMN "reviewAccount" BOOLEAN NOT NULL DEFAULT false;

-- Few rows ever (one per store), looked up by id; a partial index keeps the admin list cheap.
CREATE INDEX "User_reviewAccount_idx" ON "User" ("id") WHERE "reviewAccount";
