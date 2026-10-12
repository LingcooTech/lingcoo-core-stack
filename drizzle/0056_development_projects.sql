CREATE TABLE "development_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"app_id" uuid,
	"source" jsonb,
	"definition" jsonb,
	"definition_digest" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "development_projects_code_unique" UNIQUE("code"),
	CONSTRAINT "development_projects_app_id_unique" UNIQUE("app_id")
);
--> statement-breakpoint
ALTER TABLE "app_build_requests" ALTER COLUMN "app_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app_publishing_tokens" ALTER COLUMN "app_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app_releases" ALTER COLUMN "app_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app_build_requests" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "app_publishing_tokens" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "app_releases" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "development_projects" ADD CONSTRAINT "development_projects_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_build_requests" ADD CONSTRAINT "app_build_requests_project_id_development_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."development_projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_publishing_tokens" ADD CONSTRAINT "app_publishing_tokens_project_id_development_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."development_projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_releases" ADD CONSTRAINT "app_releases_project_id_development_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."development_projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_releases" ADD CONSTRAINT "app_releases_project_version_key" UNIQUE("project_id","version");
--> statement-breakpoint
INSERT INTO development_projects (id,code,name,app_id,source,definition,definition_digest)
SELECT a.id,a.code,a.name,a.id,s.source,s.definition,s.definition_digest FROM apps a LEFT JOIN app_sources s ON s.app_id=a.id;
--> statement-breakpoint
UPDATE app_releases SET project_id=app_id WHERE app_id IS NOT NULL;
--> statement-breakpoint
UPDATE app_build_requests SET project_id=app_id WHERE app_id IS NOT NULL;
--> statement-breakpoint
UPDATE app_publishing_tokens SET project_id=app_id WHERE app_id IS NOT NULL;
