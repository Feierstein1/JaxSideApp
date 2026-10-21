-- P13.1 (DB review A4): "@name" prefix search (LIKE 'abc%') without an extra index.
-- Normalized usernames are only [a-z0-9_], so byte order ("C") is their natural order. With it, the
-- existing unique index serves prefix searches; under the database's en_US collation it can't.
-- Prisma can't read back a custom operator class (the index made in fk_indexes showed up as a change
-- in every later diff) but ignores column collations, so this causes no drift (D109).
DROP INDEX IF EXISTS "User_usernameNormalized_idx";
ALTER TABLE "User" ALTER COLUMN "usernameNormalized" TYPE VARCHAR(20) COLLATE "C";
