ALTER TABLE "hosting_exits" DROP CONSTRAINT "hosting_exits_valid";--> statement-breakpoint
ALTER TABLE "hosting_exits" ADD CONSTRAINT "hosting_exits_valid" CHECK ("hosting_exits"."version">0 and "hosting_exits"."state" in ('requested','withdrawn','stopping','retained','completed') and ("hosting_exits"."retention_days" is null or "hosting_exits"."retention_days" between 1 and 3650));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_hosting_exit_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'hosting exit records cannot be deleted'; END IF;
 IF ROW(NEW.id,NEW.deployment_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.deployment_id,OLD.created_at) OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'hosting exit identity or version conflict';
 END IF;
 IF NOT ((OLD.state='requested' AND NEW.state IN ('stopping','withdrawn')) OR (OLD.state='withdrawn' AND NEW.state='requested') OR (OLD.state='stopping' AND NEW.state='retained') OR (OLD.state='retained' AND NEW.state IN ('retained','completed'))) THEN
  RAISE EXCEPTION 'invalid hosting exit transition';
 END IF;
 IF NEW.reason IS DISTINCT FROM OLD.reason AND NOT (OLD.state='withdrawn' AND NEW.state='requested') THEN RAISE EXCEPTION 'exit reason is immutable within a request'; END IF;
 IF NEW.state IN ('requested','withdrawn') AND (NEW.operation_id IS NOT NULL OR NEW.evidence IS NOT NULL OR NEW.retain_until IS NOT NULL OR NEW.handover_reference IS NOT NULL) THEN RAISE EXCEPTION 'unstarted exit cannot contain execution evidence'; END IF;
 IF OLD.evidence IS NOT NULL AND NEW.evidence IS DISTINCT FROM OLD.evidence THEN RAISE EXCEPTION 'exit evidence is immutable'; END IF;
 IF OLD.operation_id IS NOT NULL AND ROW(NEW.operation_id,NEW.retention_days) IS DISTINCT FROM ROW(OLD.operation_id,OLD.retention_days) THEN RAISE EXCEPTION 'exit operation and policy are immutable'; END IF;
 IF NEW.state IN ('retained','completed') AND (NEW.evidence IS NULL OR NEW.retain_until IS NULL) THEN RAISE EXCEPTION 'exit requires verified backup'; END IF;
 IF NEW.state='completed' AND NEW.handover_reference IS NULL THEN RAISE EXCEPTION 'exit requires handover'; END IF;
 RETURN NEW;
END;
$$;
