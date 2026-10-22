-- D111: at most 30 friends, and at most 30 requests waiting (were 1000 and 100). D112: feeds
-- load 30 posts at a time with a "Load more posts" button (was 15, loaded on scroll). Only the
-- old defaults are moved; a value someone changed is kept.
UPDATE "AppConfiguration" SET value = '30'::jsonb WHERE key = 'friends.max' AND value = '1000'::jsonb;
UPDATE "AppConfiguration" SET value = '30'::jsonb WHERE key = 'friends.maxPendingOut' AND value = '100'::jsonb;
UPDATE "AppConfiguration" SET value = '30'::jsonb WHERE key = 'feed.pageSize' AND value = '15'::jsonb;
