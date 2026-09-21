-- Transactional storage for mutable gallery records. KV remains the legacy source.
-- A null value is a tombstone and prevents deleted records being imported again.
CREATE TABLE IF NOT EXISTS gallery_records (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value))
);
