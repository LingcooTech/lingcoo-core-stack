CREATE TYPE "public"."job_run_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'dead');
--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'system', 'job');
--> statement-breakpoint
CREATE TYPE "public"."audit_outcome" AS ENUM('succeeded', 'failed');
--> statement-breakpoint
CREATE TABLE "job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "queue" varchar(64) DEFAULT 'default' NOT NULL,
  "kind" varchar(120) NOT NULL,
  "status" "job_run_status" DEFAULT 'pending' NOT NULL,
  "priority" integer DEFAULT 100 NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "dedupe_key" varchar(255),
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" varchar(120),
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_by_user_id" uuid,
  "related_entity_type" varchar(64),
  "related_entity_id" varchar(255),
  "trace_id" varchar(120),
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_type" "audit_actor_type" DEFAULT 'user' NOT NULL,
  "actor_user_id" uuid,
  "actor_label" varchar(160),
  "action" varchar(160) NOT NULL,
  "resource_type" varchar(64) NOT NULL,
  "resource_id" varchar(255),
  "outcome" "audit_outcome" DEFAULT 'succeeded' NOT NULL,
  "summary" varchar(255),
  "ip_address" varchar(64),
  "user_agent" varchar(500),
  "request_id" varchar(120),
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "job_runs"
    ADD CONSTRAINT "job_runs_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_runs_status_available_idx" ON "job_runs" ("status", "available_at", "priority", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_runs_kind_created_idx" ON "job_runs" ("kind", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_runs_created_by_user_id_idx" ON "job_runs" ("created_by_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_runs_dedupe_key_idx" ON "job_runs" ("dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_idx" ON "audit_logs" ("action", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_resource_created_idx" ON "audit_logs" ("resource_type", "resource_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_actor_created_idx" ON "audit_logs" ("actor_user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_outcome_created_idx" ON "audit_logs" ("outcome", "created_at");
