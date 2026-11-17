-- D261: when a business or organizer login agreed to the JaxSide for Business Terms, and to
-- which version (the website stores it at sign-up; null for accounts made before).
ALTER TABLE "BusinessAccount" ADD COLUMN "termsAcceptedAt" TIMESTAMPTZ(3),
                              ADD COLUMN "termsVersion" VARCHAR(20);

-- Both or neither.
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_terms_pair"
  CHECK (("termsAcceptedAt" IS NULL) = ("termsVersion" IS NULL));
