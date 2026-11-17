-- D263 (hub, Kenny approved): a business's default event picture, and a storage limit per plan.

-- AlterTable
ALTER TABLE "BusinessAccount" ADD COLUMN     "defaultEventMediaId" UUID;

-- CreateIndex
CREATE INDEX "BusinessAccount_defaultEventMediaId_idx" ON "BusinessAccount"("defaultEventMediaId");

-- AddForeignKey
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_defaultEventMediaId_fkey" FOREIGN KEY ("defaultEventMediaId") REFERENCES "AdMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Owner level only: a staff login made by an owner never has its own default.
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_default_event_owner_only"
  CHECK ("defaultEventMediaId" IS NULL OR "createdById" IS NULL);

-- Storage per business (its events' pictures plus its own AdMedia), in MB: Free 250,
-- Standard 1024, Premium 2048 (Kenny's numbers). The website shows the use and refuses uploads
-- past it.
WITH v ("code", "key", "value") AS (VALUES
  ('FREE', 'storage.maxMB', '250'),
  ('STANDARD', 'storage.maxMB', '1024'),
  ('PREMIUM', 'storage.maxMB', '2048')
)
INSERT INTO "PlanEntitlement" ("id", "planId", "key", "value")
SELECT gen_random_uuid(), p."id", v."key", v."value"::jsonb
FROM v JOIN "Plan" p ON p."code" = v."code"
ON CONFLICT ("planId", "key") DO UPDATE SET "value" = EXCLUDED."value";
