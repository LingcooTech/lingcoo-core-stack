ALTER TABLE "installs" ADD COLUMN "app_id" uuid;--> statement-breakpoint
ALTER TABLE "installs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "installs" ADD CONSTRAINT "installs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;