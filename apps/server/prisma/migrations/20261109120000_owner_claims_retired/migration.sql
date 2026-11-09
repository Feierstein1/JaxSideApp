-- AlterTable
ALTER TABLE "BusinessVerificationRequest" ADD COLUMN     "category" VARCHAR(60),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;


-- D224: a pin is both coordinates or neither.
ALTER TABLE "BusinessVerificationRequest" ADD CONSTRAINT "BusinessVerificationRequest_pin_pair"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

-- D185 / B6.5 / D224: personal app accounts are never linked to a business. The old in-app
-- owner claims are retired: Owner access made from one keeps working (verifiedBy stays
-- LEGACY_CLAIM) but no longer points at the personal account's claim; the claims (and the
-- emailed invites made from them) are deleted. The tables go once the website drops its
-- old invite pages.
UPDATE "BusinessPlaceAccess" SET "ownerClaimId" = NULL WHERE "ownerClaimId" IS NOT NULL;
DELETE FROM "OwnerClaim";
