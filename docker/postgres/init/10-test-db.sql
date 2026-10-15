-- Separate database for automated tests (P1.7). Runs only on first container init.
CREATE DATABASE jax_test;
\connect jax_test
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
