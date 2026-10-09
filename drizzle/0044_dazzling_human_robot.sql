CREATE TABLE "hosting_handover_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handover_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hosting_handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"state" varchar(16) DEFAULT 'preparing' NOT NULL,
	"sha256" varchar(64),
	"size" integer,
	"received" integer DEFAULT 0 NOT NULL,
	"encrypted_identity" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosting_handovers_operation_id_unique" UNIQUE("operation_id")
);
--> statement-breakpoint
CREATE TABLE "hosting_reclamations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"state" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"evidence" jsonb,
	CONSTRAINT "hosting_reclamations_deployment_id_unique" UNIQUE("deployment_id"),
	CONSTRAINT "hosting_reclamations_operation_id_unique" UNIQUE("operation_id")
);
--> statement-breakpoint
ALTER TABLE "hosting_exit_events" ADD COLUMN "reason" varchar(500);--> statement-breakpoint
ALTER TABLE "hosting_handover_grants" ADD CONSTRAINT "hosting_handover_grants_handover_id_hosting_handovers_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."hosting_handovers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_handover_grants" ADD CONSTRAINT "hosting_handover_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_handovers" ADD CONSTRAINT "hosting_handovers_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_handovers" ADD CONSTRAINT "hosting_handovers_operation_id_hosting_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."hosting_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_reclamations" ADD CONSTRAINT "hosting_reclamations_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_reclamations" ADD CONSTRAINT "hosting_reclamations_operation_id_hosting_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."hosting_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hosting_handovers_deployment_idx" ON "hosting_handovers" USING btree ("deployment_id","created_at");