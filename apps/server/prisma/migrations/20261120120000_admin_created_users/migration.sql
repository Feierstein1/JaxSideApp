-- D272: accounts an admin adds in the portal. They may have no email: they still get a data
-- key (so an email can be added later), but no encrypted email or email index.
ALTER TABLE "User" ADD COLUMN "adminCreated" BOOLEAN NOT NULL DEFAULT false;

-- The data key may now exist without an email (never an email without its key).
ALTER TABLE "User" DROP CONSTRAINT "User_email_material_pair";
ALTER TABLE "User" ADD CONSTRAINT "User_email_material_pair"
  CHECK ("emailEnc" IS NULL OR "dekWrapped" IS NOT NULL);

-- Only deleted or banned accounts, or accounts an admin added, may lack an email.
ALTER TABLE "User" DROP CONSTRAINT "User_email_material_required";
ALTER TABLE "User" ADD CONSTRAINT "User_email_material_required"
  CHECK ("status" IN ('DELETED', 'BANNED') OR "adminCreated"
         OR ("emailEnc" IS NOT NULL AND "emailIndex" IS NOT NULL));
