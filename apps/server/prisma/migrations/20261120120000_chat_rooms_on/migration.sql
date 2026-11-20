-- D272: chat rooms open by themselves when 2 or more people are about; the admin switch becomes
-- an "off" switch. New rooms start on, and the rooms made so far are switched on.
ALTER TABLE "ChatRoom" ALTER COLUMN "enabled" SET DEFAULT true;
UPDATE "ChatRoom" SET "enabled" = true WHERE NOT "enabled";
