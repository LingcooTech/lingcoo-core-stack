CREATE TABLE "hosting_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"server_ip" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"cpu_millis" integer NOT NULL,
	"memory_mb" integer NOT NULL,
	"disk_mb" integer NOT NULL,
	"report_token_hash" varchar(255) NOT NULL,
	"report" jsonb,
	"last_reported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosting_nodes_server_ip_unique" UNIQUE("server_ip")
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "deployment_mode" varchar(24) DEFAULT 'self_hosted' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "hosted_prefix" varchar(48);--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "hosted_domain" varchar(255);--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "hosting_node_id" uuid;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "hosting_state" varchar(32);--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "hosting_resources" jsonb;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_hosting_node_id_hosting_nodes_id_fk" FOREIGN KEY ("hosting_node_id") REFERENCES "public"."hosting_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_hosted_prefix_key" ON "deployments" USING btree ("hosted_prefix");--> statement-breakpoint
CREATE INDEX "deployments_hosting_node_idx" ON "deployments" USING btree ("hosting_node_id");