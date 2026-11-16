-- D251: closing a Contact ticket answers it: "Resolved" (optional note) or "Need more details"
-- (a note saying what's needed); the sender is emailed either way when they can be.
ALTER TYPE "ContactStatus" ADD VALUE 'NEEDS_INFO' BEFORE 'RESOLVED';

ALTER TABLE "ContactMessage" ADD COLUMN "adminNote" VARCHAR(1000);
