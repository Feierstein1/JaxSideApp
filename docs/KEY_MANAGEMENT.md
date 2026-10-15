# Key management

How the app's secrets and encryption keys are created, stored, backed up, rotated and retired.
Decisions: D35 (encryption design), D36 (no birth year), D37 (retention and legal hold).

## What is protected

| Data                             | How it's stored                                                                        | Readable from a leaked database?                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Email address                    | AES-256-GCM, encrypted with the user's own data key                                    | No                                                                                      |
| Email for lookup and uniqueness  | Keyed hash (HMAC-SHA256)                                                               | No. Can't be matched against lists of known emails without `EMAIL_INDEX_KEY`            |
| Pending new email (email change) | Same as email                                                                          | No                                                                                      |
| Birth year                       | **Not stored** (D36). Only the cutoff year the user passed ("born in 2007 or earlier") | Nothing to read                                                                         |
| Password                         | argon2id hash                                                                          | No (one-way)                                                                            |
| Session and email tokens         | SHA-256 hash                                                                           | No (one-way)                                                                            |
| Email codes                      | HMAC with `SESSION_SECRET`                                                             | No                                                                                      |
| IP addresses in rate limits      | HMAC with `SESSION_SECRET`, truncated                                                  | No                                                                                      |
| Precise location checks          | Plain coordinates, admin-only, deleted after 30 days (D14)                             | Yes, for up to 30 days. Kept readable so impossible-travel detection can compare points |

## Keys

| Secret                                                   | Purpose                                                   | If it leaks                                                                        | If it's lost                                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEYS` (master keys, versioned `v1`, `v2`, …) | Locks each user's data key                                | Together with a DB copy, emails become readable. **Rotate immediately**            | **Every stored email is unreadable forever.** Users can still sign in by username, but email login and reset stop working |
| `ENCRYPTION_KEY_ID`                                      | Which master key encrypts new data                        | Not secret                                                                         | Set it again                                                                                                              |
| `EMAIL_INDEX_KEY`                                        | Keys the email lookup hash                                | Together with a DB copy, an attacker can test whether a known email has an account | Email lookups fail until the index is rebuilt (possible while the master keys are available)                              |
| `SESSION_SECRET`                                         | Email-code HMAC and rate-limit hashing (short-lived data) | Short-lived codes could be guessed offline; rotate                                 | Outstanding codes stop working; nothing permanent is lost                                                                 |

All keys are 32 random bytes (base64). The server refuses to start if a key is missing, the wrong
length, a placeholder, or reused for another purpose.

Generate a key:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Where keys live

| Environment     | Storage                                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Development** | Root `.env` (git-ignored). Dev keys protect dev data only and must never be used in production                                                                                                                                                           |
| **Production**  | A managed secrets store, injected as environment variables at startup. Options: AWS Secrets Manager or KMS, Google Secret Manager, or the hosting platform's encrypted secrets. **Needs your approval** (paid, roughly $1–2/month). Decide before launch |

**Rules**

1. Keys never go in git, the database, logs, error messages, or the mobile app. Env validation
   never prints values.
2. **Back up keys separately from the database.** A database backup plus its keys equals plaintext.
   Keep an offline copy, for example in a password manager vault, in a different account or
   location from the database backups.
3. Only the people who run production can read production keys. Grant access per person and
   remove it when someone leaves.
4. Anyone who has ever had access to a key that might be exposed → rotate it.

## Rotation

**Master key (`ENCRYPTION_KEYS`):** no downtime, and no email is re-encrypted.

1. Generate `v2`. Set `ENCRYPTION_KEYS=v1:…,v2:…` and `ENCRYPTION_KEY_ID=v2`, then deploy. New
   users get `v2`; existing users still read with `v1`.
2. Run the rewrap job (to be built before launch): for each user, `rewrapUserKey()` re-locks their
   data key under `v2`. Emails are untouched.
3. When no wrapped key references `v1`, remove `v1` from `ENCRYPTION_KEYS` and destroy it.

**`EMAIL_INDEX_KEY`:** decrypt each email (needs the master keys) and recompute its index with the
new key, in one maintenance job. Do this rarely; leakage alone justifies it.

**`SESSION_SECRET`:** replace it. Outstanding email codes and rate-limit windows reset; nothing
else is affected.

## Retention and legal hold (D37)

| Situation                                                                            | What happens to the encrypted email                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active account                                                                       | Kept                                                                                                                                                                                                                       |
| Account deleted by the user                                                          | Kept encrypted for **30 days** (D14), so reports that arrive after deletion can still be acted on. Then **crypto-shredded**: the user's data key and ciphertext are destroyed, and copies in backups become unreadable too |
| Banned account                                                                       | The encrypted email may be shredded like any other, but the **lookup hash is kept** so the same email can't register again. The hash alone doesn't reveal the address                                                      |
| **Legal hold** (`legalHoldAt` set by an admin, e.g. CSAM, threats, a police request) | **Never shredded while the hold is active**, even after deletion. The admin records the reason. The hold is released only by an admin, which is audited                                                                    |

**CSAM:** US providers must report apparent CSAM to NCMEC (18 U.S.C. §2258A) and preserve the
report's contents for a set period (currently one year, extended in 2024). **An attorney should
confirm current obligations before launch** (risk R4). The legal hold is the mechanism for this.

**Admin access to an email:** the admin portal (Phase 5) will decrypt a user's email only through a
"reveal email" action that requires a written reason and is recorded in `AdminAuditLog`. There is no
bulk export of emails.

## What this does not protect against

An attacker who controls the running server **and** its environment can decrypt, because the app
must decrypt emails to send them. Defenses there are operational: limited production access,
patched dependencies, and monitoring. What we can honestly tell users: _"Your email is encrypted,
and the keys are stored separately from our database."_
