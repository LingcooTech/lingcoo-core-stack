CREATE TABLE "doc_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "space_slug" varchar(160) NOT NULL,
  "page_path" varchar(500) NOT NULL,
  "helpful" boolean NOT NULL,
  "comment" text,
  "user_id" uuid,
  "user_agent" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "doc_feedback"
    ADD CONSTRAINT "doc_feedback_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_feedback_space_path_idx" ON "doc_feedback" ("space_slug", "page_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_feedback_created_at_idx" ON "doc_feedback" ("created_at");
