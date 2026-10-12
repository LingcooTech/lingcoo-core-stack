ALTER TABLE "deployment_compose_bindings" ADD COLUMN "server_host" varchar(255);--> statement-breakpoint
UPDATE deployment_compose_bindings b SET server_host = d.server_host FROM deployments d WHERE d.id = b.deployment_id;
--> statement-breakpoint
CREATE UNIQUE INDEX "deployment_compose_bindings_server_port_key" ON "deployment_compose_bindings" USING btree ("server_host","loopback_port");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_deployment_compose_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deployment_id IS DISTINCT FROM OLD.deployment_id
     OR NEW.release_id IS DISTINCT FROM OLD.release_id
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.loopback_port IS DISTINCT FROM OLD.loopback_port
     OR NEW.server_host IS DISTINCT FROM OLD.server_host
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Installation binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION protect_compose_deployment_target() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.server_host IS DISTINCT FROM OLD.server_host
      OR NEW.hosting_node_id IS DISTINCT FROM OLD.hosting_node_id
      OR NEW.deployment_mode IS DISTINCT FROM OLD.deployment_mode
      OR NEW.app_id IS DISTINCT FROM OLD.app_id)
     AND EXISTS (SELECT 1 FROM deployment_compose_bindings WHERE deployment_id = OLD.id) THEN
    RAISE EXCEPTION 'Bound installation target is immutable; explicit migration required';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER compose_deployment_target_immutable BEFORE UPDATE ON deployments
FOR EACH ROW EXECUTE FUNCTION protect_compose_deployment_target();
