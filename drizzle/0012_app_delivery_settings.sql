CREATE TABLE IF NOT EXISTS "app_delivery_settings" (
  "app_id" uuid PRIMARY KEY NOT NULL,
  "value" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_encrypted" boolean DEFAULT false NOT NULL,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_delivery_settings" ADD CONSTRAINT "app_delivery_settings_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_delivery_settings" ADD CONSTRAINT "app_delivery_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "app_delivery_settings" ("app_id", "value", "is_encrypted", "updated_by_user_id", "created_at", "updated_at")
SELECT
  a."id",
  s."value",
  s."is_encrypted",
  s."updated_by_user_id",
  s."created_at",
  s."updated_at"
FROM "system_settings" s
JOIN "apps" a
  ON s."key" = ('deployment.delivery.' || a."code")
ON CONFLICT ("app_id") DO NOTHING;
