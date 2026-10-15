-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "EmailToken" DROP COLUMN "newEmail";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "birthYear",
DROP COLUMN "email",
ALTER COLUMN "ageCutoffYear" SET NOT NULL;


-- D35/D37 (hand-written): an account's data key and encrypted email exist together or not at all
-- (both are destroyed together when shredding), and only deleted or banned accounts may lack them.
ALTER TABLE "User" ADD CONSTRAINT "User_email_material_pair"
  CHECK (("emailEnc" IS NULL) = ("dekWrapped" IS NULL));
ALTER TABLE "User" ADD CONSTRAINT "User_email_material_required"
  CHECK ("status" IN ('DELETED', 'BANNED') OR ("emailEnc" IS NOT NULL AND "emailIndex" IS NOT NULL));
