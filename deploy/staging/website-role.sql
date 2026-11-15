-- D245: the owner website's own database login (role `jaxside_web`), on the one production
-- server. Run by deploy.sh after every migration, so tables added later are covered; safe to run
-- any number of times. The password comes from the server's .env (WEB_DB_PASSWORD) and is only
-- used to create the role or reset its password.
--
--   psql -v web_password="$WEB_DB_PASSWORD" -f website-role.sql
--
-- What it may do:
--   * read every table except the private ones below (people's sessions, email tokens, admin
--     logins, direct messages, location history, who voted / attended / tapped), and read only
--     id, username and status from "User" (comment and post authors);
--   * write only the tables the website writes (its own accounts, places' business data, events,
--     ads, notices, reports, plans and codes; checked against the website's code 2026-11-15).
-- Anything else is refused by Postgres, whatever the website's code does.

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE jaxside_web LOGIN PASSWORD %L', :'web_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jaxside_web') \gexec
SELECT format('ALTER ROLE jaxside_web WITH LOGIN PASSWORD %L', :'web_password') \gexec
ALTER ROLE jaxside_web SET statement_timeout = '30s';
ALTER ROLE jaxside_web SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE jaxside_web CONNECTION LIMIT 15;

SELECT format('GRANT CONNECT ON DATABASE %I TO jaxside_web', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO jaxside_web;

-- Start from nothing each run, then grant (so a table moved to the private list loses access).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM jaxside_web;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO jaxside_web;

-- Private: never readable by the website.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND (c.relname IN (
        'User', 'Session', 'GuestSession', 'EmailToken', 'AdminCredential', 'SecurityEvent',
        'AccountDeletion', 'LocationFlag', 'AreaVisit', 'VisitKey', 'Installation',
        'UserSettings', 'UsernameHistory', 'Friendship', 'UserBlock',
        'Message', 'MessageHide', 'Conversation', 'ConversationMember',
        'ChatMessage', 'ChatPresence', 'ChatMute', 'ChatOffense',
        'PollVoter', 'PollKey', 'PollSelection', 'PollVoterTally', 'Vote', 'PlaceRating',
        'AdViewMark', 'AdTapMark', 'EventTapMark', 'AdInterest', 'EventAttendance',
        'GuideSeen', 'UserActiveDay', 'AdminAuditLog', 'AutoSuspension', 'Appeal',
        '_prisma_migrations')
        OR c.relname LIKE 'LocationCheck%')
  LOOP
    EXECUTE format('REVOKE ALL ON %I FROM jaxside_web', t);
  END LOOP;
END $$;

-- "User": only who wrote something, never emails, passwords or settings.
GRANT SELECT (id, username, status) ON "User" TO jaxside_web;

-- What the website writes.
GRANT INSERT, UPDATE, DELETE ON
  "Ad", "AdMedia", "BusinessAccount", "BusinessNotice", "BusinessPlaceAccess", "BusinessPost",
  "BusinessSession", "BusinessTeamMember", "BusinessVerificationRequest", "Comment",
  "ContactMessage", "Event", "EventChatMessage", "EventImage", "EventOrganizer", "EventSession",
  "Notification", "Photo", "Report", "Subscription", "RateLimitCounter",
  -- D248: promo codes (one use per business), boosts; D242: change requests.
  "PromoRedemption", "Boost", "PlaceChangeRequest", "OrganizerNameRequest"
TO jaxside_web;
-- Places: the website edits a place's business details, never adds or removes places.
GRANT UPDATE ON "BusinessPlace" TO jaxside_web;
-- D248: using a code counts it (the CHECK keeps uses within the cap).
GRANT UPDATE ("uses") ON "PromoCode" TO jaxside_web;
