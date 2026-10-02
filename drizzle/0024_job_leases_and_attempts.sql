ALTER TABLE "job_runs" ADD COLUMN "claim_token" uuid;
--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "lease_expires_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "job_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "job_runs"("id") ON DELETE CASCADE,
  "attempt" integer NOT NULL,
  "claim_token" uuid NOT NULL UNIQUE,
  "status" varchar(32) NOT NULL,
  "error" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
UPDATE "job_runs" SET "status" = 'pending', "finished_at" = NULL WHERE "status" = 'failed' AND "attempts" < "max_attempts";
