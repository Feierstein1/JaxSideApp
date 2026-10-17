-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profileColor" VARCHAR(20) NOT NULL DEFAULT 'teal';


-- Hand-written: existing accounts get a random color from the palette (D69).
UPDATE "User" SET "profileColor" = (ARRAY['teal','gold','black','old_gold','red','crimson','orange','amber','sunshine','lime','green','mint','emerald','sky','blue','navy','indigo','purple','lavender','pink','rose','brown','slate','silver'])[1 + floor(random() * 24)::int];
