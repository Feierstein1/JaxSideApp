-- D248: new enum values in their own migration.
ALTER TYPE "SubscriptionSource" ADD VALUE 'FREE_PLAN';
ALTER TYPE "SubscriptionSource" ADD VALUE 'PROMO';
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'TRIAL_ENDING';
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'PLAN_DOWNGRADED';
