-- D242: new enum values in their own migration (they're used by CHECKs in the next one).
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'EVENT_DUPLICATE';
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'PLACE_CHANGE_APPROVED';
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'PLACE_CHANGE_REJECTED';
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'ORGANIZER_NAME_APPROVED';
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'ORGANIZER_NAME_REJECTED';
ALTER TYPE "EventStatus" ADD VALUE 'DUPLICATE';
