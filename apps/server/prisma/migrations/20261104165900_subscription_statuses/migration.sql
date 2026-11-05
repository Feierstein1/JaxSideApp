-- D202: statuses Stripe uses (B4.1). Their own migration: Postgres can't use a new enum
-- value in the same transaction that adds it (the next migration's index does).
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING' BEFORE 'ACTIVE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE' AFTER 'ACTIVE';
