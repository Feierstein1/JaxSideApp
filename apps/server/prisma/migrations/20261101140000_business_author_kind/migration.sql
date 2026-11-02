-- D172: a comment can come from the place's business (business website). Its own
-- migration: Postgres can't use a new enum value in the step that adds it.
ALTER TYPE "AuthorKind" ADD VALUE IF NOT EXISTS 'BUSINESS';
