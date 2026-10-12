CREATE TABLE "deployment_compose_bindings" (
	"deployment_id" uuid PRIMARY KEY NOT NULL,
	"release_id" uuid NOT NULL,
	"plan" jsonb NOT NULL,
	"configuration" jsonb NOT NULL,
	"loopback_port" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_compose_bindings_port_check" CHECK ("deployment_compose_bindings"."loopback_port" between 1024 and 65535)
);
--> statement-breakpoint
ALTER TABLE "deployment_compose_bindings" ADD CONSTRAINT "deployment_compose_bindings_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_compose_bindings" ADD CONSTRAINT "deployment_compose_bindings_release_id_app_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."app_releases"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION protect_deployment_compose_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deployment_id IS DISTINCT FROM OLD.deployment_id
     OR NEW.release_id IS DISTINCT FROM OLD.release_id
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.loopback_port IS DISTINCT FROM OLD.loopback_port
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Installation binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER deployment_compose_binding_immutable
BEFORE UPDATE ON deployment_compose_bindings
FOR EACH ROW EXECUTE FUNCTION protect_deployment_compose_binding();
