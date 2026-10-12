CREATE TABLE "deployment_compose_requests" (
	"deployment_id" uuid PRIMARY KEY NOT NULL,
	"release_id" uuid NOT NULL,
	"plan" jsonb NOT NULL,
	"configuration" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployment_compose_requests" ADD CONSTRAINT "deployment_compose_requests_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_compose_requests" ADD CONSTRAINT "deployment_compose_requests_release_id_app_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."app_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION protect_deployment_compose_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deployment_id IS DISTINCT FROM OLD.deployment_id
     OR NEW.release_id IS DISTINCT FROM OLD.release_id
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Requested installation is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER deployment_compose_request_immutable BEFORE UPDATE ON deployment_compose_requests
FOR EACH ROW EXECUTE FUNCTION protect_deployment_compose_request();
--> statement-breakpoint
CREATE FUNCTION protect_compose_requested_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.app_id IS DISTINCT FROM OLD.app_id OR NEW.deployment_mode IS DISTINCT FROM OLD.deployment_mode)
     AND EXISTS (SELECT 1 FROM deployment_compose_requests WHERE deployment_id = OLD.id) THEN
    RAISE EXCEPTION 'Requested installation identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER compose_requested_identity_immutable BEFORE UPDATE ON deployments
FOR EACH ROW EXECUTE FUNCTION protect_compose_requested_identity();
