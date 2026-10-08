CREATE TABLE "hosting_incident_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosting_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(16) NOT NULL,
	"resource_id" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"severity" varchar(16) NOT NULL,
	"state" varchar(16) NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"first_detected_at" timestamp with time zone NOT NULL,
	"last_detected_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" varchar(16),
	CONSTRAINT "hosting_incidents_valid" CHECK ("hosting_incidents"."scope" in ('node','deployment','service') and "hosting_incidents"."state" in ('active','resolved') and "hosting_incidents"."severity" in ('warning','critical') and "hosting_incidents"."occurrences">0)
);
--> statement-breakpoint
CREATE TABLE "hosting_monitor_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hosting_incident_events" ADD CONSTRAINT "hosting_incident_events_incident_id_hosting_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."hosting_incidents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hosting_incident_events_incident_idx" ON "hosting_incident_events" USING btree ("incident_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hosting_incidents_resource_idx" ON "hosting_incidents" USING btree ("scope","resource_id","code");--> statement-breakpoint
CREATE INDEX "hosting_incidents_state_idx" ON "hosting_incidents" USING btree ("state","last_detected_at");