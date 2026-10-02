CREATE TABLE IF NOT EXISTS idempotency_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scope_digest varchar(64) NOT NULL UNIQUE,
 payload_digest varchar(64) NOT NULL,
 owner_token uuid NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'processing',
 response_status integer,
 result jsonb,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
