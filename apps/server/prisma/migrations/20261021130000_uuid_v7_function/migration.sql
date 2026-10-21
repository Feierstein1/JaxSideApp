-- P13.2 (DB review A2): time-ordered UUIDv7 IDs for rows inserted with raw SQL, matching the
-- schema's @default(uuid(7)). Random v4 IDs scatter inserts across the primary-key index on the
-- fastest-growing tables. Postgres 18 has uuidv7() built in; until then this pure-SQL version:
-- a v4 UUID with its first 48 bits replaced by the Unix time in milliseconds and the version
-- nibble set to 7 (bits 52 and 53 turn 0100 into 0111). Prisma doesn't track functions (no drift).
CREATE OR REPLACE FUNCTION uuid_v7() RETURNS uuid
LANGUAGE sql VOLATILE PARALLEL SAFE AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
                placing substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
                FROM 1 FOR 6),
        52, 1),
      53, 1),
    'hex')::uuid
$$;
