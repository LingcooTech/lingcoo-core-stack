CREATE TABLE "ai_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "app_id" uuid NOT NULL,
  "provider" varchar(32) NOT NULL,
  "model" varchar(255) NOT NULL,
  "operation" varchar(32) DEFAULT 'chat' NOT NULL,
  "access_scope" varchar(32) DEFAULT 'trial' NOT NULL,
  "status" varchar(32) DEFAULT 'succeeded' NOT NULL,
  "request_chars" integer DEFAULT 0 NOT NULL,
  "response_chars" integer DEFAULT 0 NOT NULL,
  "prompt_tokens" integer DEFAULT 0 NOT NULL,
  "completion_tokens" integer DEFAULT 0 NOT NULL,
  "total_tokens" integer DEFAULT 0 NOT NULL,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_events"
  ADD CONSTRAINT "ai_usage_events_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_usage_events"
  ADD CONSTRAINT "ai_usage_events_app_id_apps_id_fk"
  FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_usage_events_user_app_created_idx" ON "ai_usage_events" USING btree ("user_id","app_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_usage_events_app_created_idx" ON "ai_usage_events" USING btree ("app_id","created_at");
