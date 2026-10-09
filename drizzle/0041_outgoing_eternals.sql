CREATE TABLE "hosting_exit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"request_key" uuid,
	"fingerprint" varchar(64),
	"kind" varchar(32) NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosting_exit_events_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
CREATE TABLE "hosting_exits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"state" varchar(24) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reason" varchar(500) NOT NULL,
	"retention_days" integer,
	"retain_until" timestamp with time zone,
	"operation_id" uuid,
	"evidence" jsonb,
	"handover_reference" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosting_exits_deployment_id_unique" UNIQUE("deployment_id"),
	CONSTRAINT "hosting_exits_valid" CHECK ("hosting_exits"."version">0 and "hosting_exits"."state" in ('requested','stopping','retained','completed') and ("hosting_exits"."retention_days" is null or "hosting_exits"."retention_days" between 1 and 3650))
);
--> statement-breakpoint
ALTER TABLE "hosting_exit_events" ADD CONSTRAINT "hosting_exit_events_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_exit_events" ADD CONSTRAINT "hosting_exit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_exits" ADD CONSTRAINT "hosting_exits_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_exits" ADD CONSTRAINT "hosting_exits_operation_id_hosting_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."hosting_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION protect_hosting_exit_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'hosting exit events are append-only'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER hosting_exit_events_immutable BEFORE UPDATE OR DELETE ON hosting_exit_events
FOR EACH ROW EXECUTE FUNCTION protect_hosting_exit_events();
--> statement-breakpoint
CREATE FUNCTION protect_hosting_exit_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'hosting exit records cannot be deleted'; END IF;
 IF ROW(NEW.id,NEW.deployment_id,NEW.reason,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.deployment_id,OLD.reason,OLD.created_at) OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'hosting exit identity or version conflict';
 END IF;
 IF NOT ((OLD.state='requested' AND NEW.state='stopping') OR (OLD.state='stopping' AND NEW.state='retained') OR (OLD.state='retained' AND NEW.state IN ('retained','completed'))) THEN
  RAISE EXCEPTION 'invalid hosting exit transition';
 END IF;
 IF OLD.evidence IS NOT NULL AND NEW.evidence IS DISTINCT FROM OLD.evidence THEN RAISE EXCEPTION 'exit evidence is immutable'; END IF;
 IF OLD.operation_id IS NOT NULL AND ROW(NEW.operation_id,NEW.retention_days) IS DISTINCT FROM ROW(OLD.operation_id,OLD.retention_days) THEN RAISE EXCEPTION 'exit operation and policy are immutable'; END IF;
 IF NEW.state IN ('retained','completed') AND (NEW.evidence IS NULL OR NEW.retain_until IS NULL) THEN RAISE EXCEPTION 'exit requires verified backup'; END IF;
 IF NEW.state='completed' AND NEW.handover_reference IS NULL THEN RAISE EXCEPTION 'exit requires handover'; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hosting_exits_guard BEFORE UPDATE OR DELETE ON hosting_exits
FOR EACH ROW EXECUTE FUNCTION protect_hosting_exit_state();
