CREATE TABLE "app_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"host" varchar(255),
	"credentials" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"version" varchar(80) NOT NULL,
	"commit" varchar(40) NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"definition" jsonb NOT NULL,
	"definition_digest" varchar(80) NOT NULL,
	"images" jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"build_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "app_releases_app_version_key" UNIQUE("app_id","version")
);
--> statement-breakpoint
CREATE TABLE "app_sources" (
	"app_id" uuid PRIMARY KEY NOT NULL,
	"source" jsonb,
	"definition" jsonb NOT NULL,
	"definition_digest" varchar(80) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_releases" ADD CONSTRAINT "app_releases_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_sources" ADD CONSTRAINT "app_sources_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;