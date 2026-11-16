# Production switch-over (D245)

The one Lightsail server (today `staging-api.jaxside.com`) becomes production for the app and
the owner website (jaxside.com). Do the steps **in order, one at a time**; each says who does it.
Nothing here runs by itself.

**Server today (2026-11-15):** `jaxside-staging-server`, Lightsail `small_3_0` (2 GB RAM, 2 vCPU,
60 GB disk, 26 GB free), 4 GB swap, **static IP 34.197.165.101** (`jaxside-staging-ip`), Docker
compose project `jaxside` in `/opt/jaxside`, network **`jaxside_default`**, Postgres (PostGIS 17) +
the app + Caddy. SES has **production access** (50,000 emails a day), sending from
`noreply@jaxside.com`. Buckets (us-east-1): `jaxside-staging-media`, `-quarantine`, `-backups` (the
names stay; only the contents are cleared).

## Progress

- **2026-11-15, step 1 done:** `api.jaxside.com` → 34.197.165.101 (GoDaddy DNS; the domain's name
  servers are GoDaddy's, `ns47` / `ns48.domaincontrol.com`).
- **2026-11-15, step 2 done:** resized to 4 GB. Backup, containers stopped, snapshot
  `jaxside-before-4gb-2026-11-15`, new instance **`jaxside-server`** (`medium_3_0`: 4 GB, 2 vCPU,
  80 GB) from it in us-east-1a with the same key and firewall (80 / 443 open, 22 from Kenny's IP),
  static IP moved, old `jaxside-staging-server` **stopped** (still billed while it exists: delete it
  once the new one has run a day or two; the snapshot stays a week as the fallback). New SSH host
  key accepted (the IP is attached to our instance). Postgres `shared_buffers` 768 MB. Deployed
  `062d768`: `api.jaxside.com` and `staging-api.jaxside.com` both answer, `/admin` is 404 there,
  `sites/` is in place. About 10 minutes of downtime.

- **2026-11-15, website first (Kenny: the website before the app's own switch-over):** the
  website's database login (`WEB_DB_PASSWORD` in `.env`, role `jaxside_web` created and tested),
  `BUSINESS_SITE_URL=https://jaxside.com` (app restarted), IAM user **`jaxside-web`** with
  `iam-web-policy.json` (tested: `ads/` write and delete allowed, `users/` refused, SES SMTP login
  ok), and the website's `deploy.env` / `production.env` written to its git-ignored
  `deploy/production/secrets/`. Next: the website deploys, then Kenny points `jaxside.com` (A, today
  GoDaddy's parked page) at 34.197.165.101; `www` is already an alias. Steps 3 (fresh app keys), 6
  (wipe) and the rest of the app's switch-over come **last**.
- **2026-11-15, the website is live:** the website's AI deployed (container healthy, about 180 MB
  of its 768 MB; the server about 1.1 GB used of 4 GB), then Kenny pointed `jaxside.com` (A) at
  34.197.165.101 at GoDaddy. Caddy got Let's Encrypt certificates for `jaxside.com` and `www`
  (`www` → `https://jaxside.com`, `http` → `https`); https://jaxside.com and `/signup` answer.
- **2026-11-16, Kenny's wipe answers (decision 2 settled):** keep all 6 community places (5 Points
  Liquor Lounge, Aldi, Five Guys, Flamingo Coffee, Messa, SNAP Fitness); removed places stay removed;
  **every business and organizer account made so far goes** (all were tests, including places Kenny
  claimed to test), with their Owner access, ads, events, posts and tickets, and all app test users.
  That is exactly what `wipe-for-launch.sql` does as written (it never changes a place's status, so
  removed places stay removed, and map imports keep them removed), so it stays as is. **Kenny says
  when**, after testing; anything real made before then would go too, so nobody real signs up until
  the wipe (jaxside.com stays hidden from search engines until the apps launch).

## Decisions first (Kenny)

1. **Resize to 4 GB?** Recommended. 2 GB has to hold Postgres, the app, Caddy and the website (capped
   at 768 MB), and building the website needs about 1.5 GB more. It works on 2 GB with swap, but
   slowly and close to the edge. Lightsail `medium_3_0` (4 GB) costs about $24 a month instead of
   about $12. Because the address is a **static IP**, resizing **keeps 34.197.165.101**: it doesn't
   have to come before DNS.
2. **The 6 places people added** (`sourceName = 'community'`) stay on the map unless you say
   otherwise; some may be test places. List them with step 6's query and say which go.
3. **After the wipe nobody has an account**, admins included. You make your own account in the app
   again and it's made an admin (step 9). Admin-made topics, polls and giveaways are wiped too (they
   were test content).

## Steps

1. **DNS (Kenny):** add an `A` record **`api.jaxside.com` → 34.197.165.101**. Harmless before
   launch; Caddy needs it to get the certificate. (Leave jaxside.com / www for step 11.)
2. **Resize (Kenny says go; Claude runs, about 15 minutes of downtime):** snapshot the instance,
   create a `medium_3_0` instance from it, stop the old one, **move the static IP** to the new one,
   check `staging-api.jaxside.com/api/v1/health`. Keep the old instance stopped a week, then delete
   it. Then set `PG_SHARED_BUFFERS=768MB` and `PG_EFFECTIVE_CACHE=2GB` in the server's `.env`.
3. **Backup (Claude):** `bash backup.sh` on the server, and download a copy to Kenny's PC.
4. **Fresh keys (Claude writes them into `deploy/staging/secrets/staging.env`; Kenny keeps a copy in
   his password manager, away from the backups):** since every person's data is wiped, the keys can
   simply be new (no re-wrapping): `ENCRYPTION_KEYS=v1:<new>`, `ENCRYPTION_KEY_ID=v1`,
   `EMAIL_INDEX_KEY`, `SESSION_SECRET` (32 random bytes each, docs/KEY_MANAGEMENT.md). Also:
   `APP_BASE_URL=https://api.jaxside.com`, `BUSINESS_SITE_URL=https://jaxside.com`,
   `WEB_DB_PASSWORD=<new>` (the website's login, `website-role.sql`), and a new storage / email key
   for the app (IAM, old one deleted). The database's own password stays (it never leaves the
   server).
5. **The website's AWS key (Claude, with Kenny's OK; free):** an IAM user `jaxside-web` with
   `deploy/staging/iam-web-policy.json` (the media bucket's `ads/`, `events/`, `business-pictures/`,
   `photos/` folders only, and email from `@jaxside.com`), its access key for S3 and its SES SMTP
   password, handed to the website's `production.env`.
6. **Turn the app off (Kenny, admin portal → Maintenance, once D246 is deployed) and wipe (Claude):**
   ```sh
   # on the server, in /opt/jaxside; first look at the people-added places (decision 2):
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, name, address FROM \"BusinessPlace\" WHERE \"sourceName\" = '"'"'community'"'"'"'
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v confirm=WIPE -f -' < wipe-for-launch.sql
   ```
   Then clear the media and quarantine buckets (`aws s3 rm s3://jaxside-staging-media --recursive`,
   same for `-quarantine`; **never `-backups`**). Tested 2026-11-15 on a copy of staging: people,
   business accounts, events, ads, posts and photos go; 200 settings, 112 screening rules, the plans,
   and 4,609 places stay.
7. **Deploy with the new settings (Claude):** `bash deploy/staging/deploy.sh --env`: migrations, seed
   (production seeds no sample data), the website's database login, and Caddy with
   `api.jaxside.com`.
8. **Check (Claude):** `https://api.jaxside.com/api/v1/health` and `staging-api…` both answer;
   the admin portal opens through the SSH tunnel (docs/OPERATIONS.md); the jobs log is clean.
9. **Your admin account (Kenny, then Claude):** sign up in the app, then
   `docker compose run --rm -T app npm run admin:promote -- <username>` (the container starts in `apps/server`, where the `.env` it reads is mounted); set up your
   authenticator on the first admin sign-in.
10. **The website's settings (Claude hands over, the website's AI fills in):** `deploy.env`:
    `HOST=ubuntu@34.197.165.101`, the SSH key, `WEB_DIR=/opt/jaxside-web`,
    `CADDY_SITES=/opt/jaxside/sites`, the reload command below, `APP_NETWORK=jaxside_default`;
    `production.env`: `DATABASE_URL=postgresql://jaxside_web:<WEB_DB_PASSWORD>@postgres:5432/<db>`,
    the key from step 5, `S3_BUCKET_MEDIA=jaxside-staging-media`, `S3_REGION=us-east-1`, SMTP
    `email-smtp.us-east-1.amazonaws.com:587` with step 5's SMTP user and password, From
    `JaxSide for Business <noreply@jaxside.com>`. Caddy reload:
    `docker compose -f /opt/jaxside/docker-compose.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile`.
11. **DNS for the website (Kenny), then its deploy (the website's AI):** `A` records `jaxside.com`
    and `www.jaxside.com` → 34.197.165.101, then `bash deploy/production/deploy.sh --env` from the
    website repo. Its health check and `https://jaxside.com` should answer.
12. **Turn the app back on (Kenny)**, then sign up as a business on jaxside.com and check the whole
    path once (verify a place, make an ad live, see it in the app).
13. **Phones:** the launch builds use `https://api.jaxside.com` (EAS production environment); the
    test builds on phones keep working through `staging-api.jaxside.com` until they're retired.

## Afterwards

- Backups keep running nightly (`cron`), now of real data: keep the keys' copy safe and separate.
- `deploy/staging/` keeps its name for now; it deploys production.
