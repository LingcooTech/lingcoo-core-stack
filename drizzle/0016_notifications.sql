DO $$ BEGIN
  CREATE TYPE "notification_level" AS ENUM ('info', 'success', 'warning', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "notification_status" AS ENUM ('unread', 'read', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "category" varchar(32) DEFAULT 'system' NOT NULL,
  "level" "notification_level" DEFAULT 'info' NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "cta_label" varchar(80),
  "cta_url" varchar(500),
  "status" "notification_status" DEFAULT 'unread' NOT NULL,
  "source_event_id" uuid,
  "source_event_name" varchar(120),
  "dedupe_key" varchar(255),
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "read_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_event_id_events_id_fk"
  FOREIGN KEY ("source_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX "notifications_user_status_created_idx" ON "notifications" USING btree ("user_id","status","created_at");
--> statement-breakpoint
CREATE INDEX "notifications_user_category_created_idx" ON "notifications" USING btree ("user_id","category","created_at");
--> statement-breakpoint
CREATE INDEX "notifications_source_event_idx" ON "notifications" USING btree ("source_event_id");
