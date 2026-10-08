CREATE TABLE "hosting_service_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"request_key" uuid,
	"fingerprint" varchar(64),
	"kind" varchar(16) NOT NULL,
	"actor_user_id" uuid,
	"reason" varchar(500) NOT NULL,
	"version" integer NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosting_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"source" varchar(16) NOT NULL,
	"interval" varchar(16) NOT NULL,
	"periods" integer NOT NULL,
	"anchor_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"grace_days" integer NOT NULL,
	"retention_days" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosting_services_deployment_id_unique" UNIQUE("deployment_id"),
	CONSTRAINT "hosting_services_validity" CHECK ("hosting_services"."periods" between 1 and 1200 and "hosting_services"."version" > 0 and "hosting_services"."grace_days" between 0 and 90 and "hosting_services"."retention_days" between 1 and 3650 and "hosting_services"."source" in ('trial', 'manual') and "hosting_services"."interval" in ('month', 'year') and (("hosting_services"."anchor_at" is null and "hosting_services"."expires_at" is null) or ("hosting_services"."anchor_at" is not null and "hosting_services"."expires_at" is not null and "hosting_services"."expires_at" > "hosting_services"."anchor_at")))
);
--> statement-breakpoint
ALTER TABLE "hosting_service_changes" ADD CONSTRAINT "hosting_service_changes_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_service_changes" ADD CONSTRAINT "hosting_service_changes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_services" ADD CONSTRAINT "hosting_services_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hosting_service_changes_request_key" ON "hosting_service_changes" USING btree ("deployment_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "hosting_service_changes_version_key" ON "hosting_service_changes" USING btree ("deployment_id","version");