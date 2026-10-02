CREATE TABLE IF NOT EXISTS settings_revisions (
 key varchar(128) PRIMARY KEY,
 version integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
