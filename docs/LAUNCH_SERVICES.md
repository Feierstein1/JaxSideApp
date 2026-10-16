# Launch services plan (AWS)

What the app needs to run publicly, which AWS product covers each need, and roughly what it
costs. **Nothing here is set up or paid for until you approve it** (§1 rule 8). Prices are
us-east-1 list prices checked on 2026-10-16. Some came from third-party summaries, so confirm
them in the [AWS Pricing Calculator](https://calculator.aws/) before you commit.

Sized for a **Jacksonville beta**: hundreds to a few thousand people, a few posts a minute at
peak, photos up to about 300 KB each after processing.

## Recommendation: "small and boring" on AWS (about $30–35/month)

| Need                                        | AWS product (pick)                                                                         | Why                                                                                                                                                                  | Est. cost / month                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **App server** (Next.js API)                | **Amazon Lightsail** instance, 2 GB RAM, running our server in Docker with Caddy           | Flat price that includes a public IPv4 address and 3 TB of data transfer; simplest AWS server. Caddy gets free HTTPS certificates (Let's Encrypt) automatically      | **$12**                                             |
| **Database** (PostgreSQL 17 + PostGIS)      | **Amazon RDS for PostgreSQL**, db.t4g.micro, single-AZ, 20 GB gp3, 7-day automatic backups | PostGIS is supported (the location rules need it). Managed backups and point-in-time restore. Connected privately to Lightsail (VPC peering)                         | **~$15** (instance ~$12 + storage ~$2.30)           |
| **Photo storage**                           | **Amazon S3**, one private bucket, versioning on                                           | Our code already speaks the S3 API (SeaweedFS in dev). Photos are tiny after processing                                                                              | **< $1** (pennies per GB)                           |
| **Email** (codes, resets)                   | **Amazon SES**                                                                             | Cheapest transactional email; our code already sends over SMTP, so it's a settings change. Needs domain records (SPF, DKIM, DMARC) and a "production access" request | **< $1** (~$0.10–0.16 per 1,000)                    |
| **Secrets and keys** (D35)                  | **AWS Systems Manager Parameter Store** (SecureString) with the default AWS key            | Holds the database password, session secret and encryption master keys. Standard tier is free. (Secrets Manager does the same at $0.40 per secret)                   | **$0** (+$1 if you want a customer-managed KMS key) |
| **Domain + DNS**                            | **Route 53** hosted zone + a domain (e.g. `jaxapp.com`)                                    | DNS for the API, email records for SES                                                                                                                               | **~$1.75** ($0.50 zone + ~$15/yr domain)            |
| **Daily jobs** (retention, medals, cleanup) | cron on the Lightsail server running `npm run jobs:maintenance`                            | Already built; no extra service                                                                                                                                      | $0                                                  |
| **Monitoring**                              | **CloudWatch** basic metrics + a free uptime check (e.g. UptimeRobot)                      | Alerts if the server or database goes down                                                                                                                           | $0                                                  |
| **Server backups**                          | Lightsail snapshots (weekly)                                                               | The server itself holds no data (it's all in RDS and S3), so this is just for quick recovery                                                                         | ~$1                                                 |
| **Total**                                   |                                                                                            |                                                                                                                                                                      | **≈ $30–35**                                        |

New AWS accounts reportedly get up to $200 in credits, and Lightsail and RDS have free-trial
periods, so the first months may cost less. Check the current offers when you sign up.

### Not needed yet (and when it would be)

| Service                                | Why not now                                                                              | Add it when                                                     | Cost when added        |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------- |
| **Caching** (ElastiCache / Valkey)     | Rate limits and sessions already live in Postgres (D8); feeds are small, indexed queries | Feed responses get slow at peak, or the database CPU stays high | ~$12+/mo               |
| **CDN** (CloudFront)                   | Photos are served through the API with short-lived links; volume is small                | Photo traffic grows past a few GB a day                         | Free tier covers a lot |
| **Load balancer / second server**      | One server handles a city-sized beta                                                     | You need zero-downtime deploys or more than one server          | ~$18/mo (Lightsail LB) |
| **RDS Multi-AZ** (standby database)    | Doubles the database cost; daily backups + point-in-time restore cover a beta            | Downtime of an hour would really hurt                           | +~$12/mo               |
| **Error tracking** (Sentry free tier)  | Server logs cover it at first                                                            | You want alerts with stack traces from the app                  | Free tier              |
| **Image classification** (Rekognition) | P6.6 hook exists; people's reports + moderators first                                    | Photo volume makes manual review hard                           | ~$1 per 1,000 images   |

### Avoid

- **AWS App Runner:** reportedly closed to new customers since April 2026.
- **Lightsail managed PostgreSQL:** cheaper, but PostGIS support couldn't be confirmed, and the
  app depends on it for every location check. Use RDS (or test `CREATE EXTENSION postgis;` on a
  trial Lightsail database first).

## Outside AWS (needed regardless)

| Service                       | Used for                                    | Cost                               | Notes                                                                                      |
| ----------------------------- | ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| **Apple Developer Program**   | iPhone app in the App Store; App Attest     | **$99/year**                       | Needs an Apple account; individual or business (business needs a D-U-N-S number)           |
| **Google Play Console**       | Android app in Play; Play Integrity         | **$25 once**                       | New personal accounts must run a closed test (12+ testers for 14 days) before going public |
| **Expo EAS** (build + submit) | Building the store versions of the app      | Free tier (limited builds)         | Paid plan only if builds queue too long                                                    |
| **NCMEC CyberTipline**        | Legally required child-abuse reporting (R4) | Free                               | Register before launch                                                                     |
| **Maps** (Q13)                | Android map view                            | Free option: MapLibre + free tiles | Deferred; the list view works without it                                                   |

**Monthly total to plan for: about $30–35 on AWS + about $8 for Apple (yearly fee spread out)**,
plus $25 once for Google and ~$15/year for the domain.

## Cheaper or bigger alternatives

- **All on one Lightsail server (~$12–24/mo):** Postgres + PostGIS in Docker on the same machine.
  Cheapest, but backups, upgrades and recovery are on us, and the data isn't separated from the
  web server. OK for a private beta; not my pick for launch.
- **Grow-up path (~$150+/mo):** ECS Fargate (2 small containers) behind an Application Load
  Balancer, RDS Multi-AZ, CloudFront, ElastiCache. Only when usage calls for it; the code doesn't
  need to change, only the hosting.

## Before go-live (code and config already in place or listed in Phase 7)

1. Admin portal **off** on the public server (D62): an `ADMIN_PORTAL_ENABLED=false` setting
   (Phase 7 task). You'd keep running the portal locally against a database tunnel, or turn it on
   behind an IP allow-list later.
2. Production secrets in Parameter Store; master keys backed up offline (`docs/KEY_MANAGEMENT.md`).
3. SES out of the sandbox, with SPF/DKIM/DMARC on the domain.
4. RDS backups on; one restore drill done (P7.4).
5. The app built with the production API address (EAS), App Store / Play listings (P7.10).

Sources checked 2026-10-16:
[Lightsail pricing guide](https://cloudburn.io/blog/amazon-lightsail-pricing) ·
[Lightsail buckets FAQ (AWS)](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-buckets.html) ·
[RDS db.t4g.micro pricing](https://www.bytebase.com/dbcost/rds/instance/db.t4g.micro/) ·
[RDS for PostgreSQL pricing (AWS)](https://aws.amazon.com/rds/postgresql/pricing) ·
[SES pricing 2026](https://dev.to/mr_manushukla/amazon-ses-pricing-plans-in-2026-essentials-vs-pro-vs-enterprise-and-when-a-la-carte-still-wins-1ohg) ·
[App Runner pricing (AWS)](https://aws.amazon.com/apprunner/pricing/) ·
[App Runner status](https://comparedge.com/tools/aws/performance) ·
[Secrets Manager pricing (AWS)](https://aws.amazon.com/secrets-manager/pricing/) ·
[Public IPv4 charges](https://www.opslyft.com/blog/elastic-ip-charges) ·
[Lightsail database engines (AWS)](https://docs.aws.amazon.com/en_us/lightsail/latest/userguide/amazon-lightsail-choosing-a-database.html)
