CREATE TABLE "hosting_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"state" varchar(24) DEFAULT 'pending' NOT NULL,
	"request_key" uuid NOT NULL,
	"requested_by" uuid,
	"result" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "hosting_operations_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
ALTER TABLE "hosting_nodes" ADD COLUMN "asset" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hosting_operations" ADD CONSTRAINT "hosting_operations_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_operations" ADD CONSTRAINT "hosting_operations_node_id_hosting_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."hosting_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_operations" ADD CONSTRAINT "hosting_operations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hosting_operations_node_state_idx" ON "hosting_operations" USING btree ("node_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "hosting_operations_active_instance_key" ON "hosting_operations" USING btree ("deployment_id") WHERE "hosting_operations"."state" in ('pending', 'running');