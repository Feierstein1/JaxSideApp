# External services and credentials

What the app needs from outside services, what works today without them, and what needs your
approval. **No paid service is set up without your explicit OK** (§1 rule 8).

**For the launch hosting plan (AWS products and monthly costs), see `docs/LAUNCH_SERVICES.md`.**

| Service                              | Used for                             | Status                                                                                       | Cost                                                                     | Needs                                                                                        |
| ------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Census TIGER/Line**                | Duval County boundary (D15)          | ✅ In use (one-time download, committed)                                                     | Free, public domain                                                      | Nothing                                                                                      |
| **OpenStreetMap / Overpass API**     | Business directory import (P2.10)    | ✅ In use (on-demand import)                                                                 | Free; ODbL attribution required                                          | Nothing. Heavy refreshes should use a mirror or a self-hosted extract                        |
| **Email delivery** (Q6)              | Verification codes, password reset   | Dev: Mailpit (local). Production: **not chosen**                                             | Resend, Postmark or SES: free tier to about $15/mo                       | Your pick + domain DNS setup (SPF/DKIM)                                                      |
| **Secrets manager / KMS** (D35)      | Production encryption keys           | Dev: `.env`. Production: **not chosen**                                                      | About $1–2/mo                                                            | Your approval; see `docs/KEY_MANAGEMENT.md`                                                  |
| **Google Play Integrity API** (P2.8) | Android app-integrity signal         | 🔌 Integration point only (`apps/server/src/server/integrity.ts`); all installs "unverified" | Free quota                                                               | Google Cloud project linked to a Play Console listing (Play developer account, $25 one-time) |
| **Apple App Attest** (P2.8)          | iOS app-integrity signal             | 🔌 Integration point only                                                                    | Free                                                                     | Apple Developer Program ($99/yr), App ID with App Attest                                     |
| **Maps** (Q9)                        | Map view in the app and admin portal | `react-native-maps` in the app (Expo Go, no key needed in dev)                               | Google Maps SDK has a free tier; MapLibre + free tiles is an alternative | Your pick (Q9). Android Google Maps needs an API key with billing enabled                    |
| **Expo / EAS Build**                 | iOS and Android release builds       | Not set up (Expo Go used for dev)                                                            | Free tier                                                                | Expo account; Apple/Google developer accounts for store releases                             |
| **Hosting** (server + PostGIS + S3)  | Production                           | Not set up; no public deployment without approval                                            | Varies                                                                   | Your approval                                                                                |
| **NCMEC CyberTipline** (R4)          | Legally required CSAM reporting      | Not registered                                                                               | Free                                                                     | Registration before launch; attorney review                                                  |

## Integrity checks (P2.8)

The server records each installation's integrity status, currently always `unverified`. The
`IntegrityVerifier` interface in `integrity.ts` is where the Play Integrity and App Attest checks
go once the accounts above exist. These are **advisory signals**. They make spoofing harder but
can't prove a device is honest (risks R1, R2), so they'll raise or lower trust rather than be the
only gate.
