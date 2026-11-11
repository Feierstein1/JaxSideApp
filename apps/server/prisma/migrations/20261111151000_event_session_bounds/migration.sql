-- D230: every event's "firstStartsAt" / "lastEndsAt" follow its sessions, whichever app (the
-- admin portal here, or the business website) adds, moves or deletes them.
CREATE OR REPLACE FUNCTION event_session_bounds() RETURNS trigger AS $$
DECLARE
  target UUID := COALESCE(NEW."eventId", OLD."eventId");
BEGIN
  UPDATE "Event" e
  SET "firstStartsAt" = b.first_start, "lastEndsAt" = b.last_end
  FROM (SELECT min("startsAt") AS first_start, max("endsAt") AS last_end
        FROM "EventSession" WHERE "eventId" = target) b
  WHERE e.id = target;
  -- A session moved to another event (never done by the apps, but keep both right).
  IF TG_OP = 'UPDATE' AND OLD."eventId" <> NEW."eventId" THEN
    UPDATE "Event" e
    SET "firstStartsAt" = b.first_start, "lastEndsAt" = b.last_end
    FROM (SELECT min("startsAt") AS first_start, max("endsAt") AS last_end
          FROM "EventSession" WHERE "eventId" = OLD."eventId") b
    WHERE e.id = OLD."eventId";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EventSession_bounds"
AFTER INSERT OR UPDATE OR DELETE ON "EventSession"
FOR EACH ROW EXECUTE FUNCTION event_session_bounds();
