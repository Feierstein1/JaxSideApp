-- D105: replies go one level deep (post → comment → reply), and a post takes at most 100
-- comments, replies included. Only the old default is moved (a value someone changed is kept).
UPDATE "AppConfiguration" SET value = '1'::jsonb WHERE key = 'comments.maxDepth' AND value = '3'::jsonb;
INSERT INTO "AppConfiguration" (key, value, description, "updatedAt")
VALUES ('comments.limitPerPost', '100'::jsonb, 'A post with this many comments (replies included) takes no more (D105)', now())
ON CONFLICT (key) DO NOTHING;
