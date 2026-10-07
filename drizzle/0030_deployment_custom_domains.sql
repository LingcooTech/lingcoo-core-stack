CREATE TABLE "deployment_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"hostname" varchar(253) NOT NULL,
	"verification_token" varchar(128) NOT NULL,
	"state" varchar(24) DEFAULT 'pending_dns' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_domains_hostname_unique" UNIQUE("hostname")
);
--> statement-breakpoint
ALTER TABLE "deployment_domains" ADD CONSTRAINT "deployment_domains_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;