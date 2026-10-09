CREATE TABLE "hosting_upgrades" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"deployment_id" uuid NOT NULL,
	"plan" jsonb NOT NULL,
	"evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hosting_upgrades" ADD CONSTRAINT "hosting_upgrades_operation_id_hosting_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."hosting_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_upgrades" ADD CONSTRAINT "hosting_upgrades_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION protect_hosting_upgrade() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Upgrade audit is immutable'; END IF;
  IF TG_OP='UPDATE' AND (NEW.operation_id IS DISTINCT FROM OLD.operation_id OR NEW.deployment_id IS DISTINCT FROM OLD.deployment_id OR NEW.plan IS DISTINCT FROM OLD.plan OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.evidence IS NOT NULL) THEN
    RAISE EXCEPTION 'Upgrade identity and completed evidence are immutable';
  END IF;
  IF jsonb_typeof(NEW.plan) IS DISTINCT FROM 'object' OR NEW.plan->>'schemaPolicy' IS DISTINCT FROM 'no-migration' THEN RAISE EXCEPTION 'Reviewed upgrade plan required'; END IF;
  IF NEW.evidence IS NOT NULL AND (jsonb_typeof(NEW.evidence) IS DISTINCT FROM 'object' OR NEW.evidence->>'operationId' IS DISTINCT FROM NEW.operation_id::text OR NEW.evidence->>'deploymentId' IS DISTINCT FROM NEW.deployment_id::text OR NEW.evidence->>'releaseId' IS DISTINCT FROM NEW.plan->>'id') THEN RAISE EXCEPTION 'Upgrade evidence ownership mismatch'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER hosting_upgrade_guard BEFORE INSERT OR UPDATE OR DELETE ON hosting_upgrades FOR EACH ROW EXECUTE FUNCTION protect_hosting_upgrade();
