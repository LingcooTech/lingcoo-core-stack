CREATE FUNCTION protect_hosting_handover() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'handover records are retained for audit'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.deployment_id,NEW.operation_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.deployment_id,OLD.operation_id,OLD.created_at) THEN RAISE EXCEPTION 'handover identity is immutable'; END IF;
  IF OLD.size IS NOT NULL AND ROW(NEW.size,NEW.sha256) IS DISTINCT FROM ROW(OLD.size,OLD.sha256) THEN RAISE EXCEPTION 'handover content is immutable'; END IF;
  IF OLD.state='revoked' AND NEW.state<>'revoked' OR OLD.state='ready' AND NEW.state='preparing' THEN RAISE EXCEPTION 'handover state cannot regress'; END IF;
  IF NEW.received<OLD.received AND NEW.state<>'revoked' THEN RAISE EXCEPTION 'handover offset cannot regress'; END IF;
 END IF;
 IF NEW.state NOT IN ('preparing','ready','revoked') OR NEW.received<0 OR (NEW.size IS NOT NULL AND (NEW.size<1 OR NEW.size>1073741824 OR NEW.received>NEW.size)) THEN RAISE EXCEPTION 'invalid handover bounds'; END IF;
 IF NEW.state='ready' AND (NEW.size IS NULL OR NEW.sha256 IS NULL OR NEW.encrypted_identity IS NULL OR NEW.received<>NEW.size) THEN RAISE EXCEPTION 'ready handover requires verified content'; END IF;
 IF NEW.state='revoked' AND NEW.encrypted_identity IS NOT NULL THEN RAISE EXCEPTION 'revoked handover cannot retain its delivery key'; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hosting_handovers_guard BEFORE INSERT OR UPDATE OR DELETE ON hosting_handovers FOR EACH ROW EXECUTE FUNCTION protect_hosting_handover();
--> statement-breakpoint
CREATE FUNCTION protect_hosting_reclamation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'reclamation records are immutable audit evidence'; END IF;
 IF TG_OP='UPDATE' AND (OLD.state='completed' OR ROW(NEW.id,NEW.deployment_id,NEW.operation_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.deployment_id,OLD.operation_id,OLD.created_at)) THEN RAISE EXCEPTION 'reclamation identity and completed evidence are immutable'; END IF;
 IF NEW.state NOT IN ('pending','completed') OR (NEW.state='completed' AND (NEW.completed_at IS NULL OR NEW.evidence IS NULL)) THEN RAISE EXCEPTION 'reclamation requires evidence'; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hosting_reclamations_guard BEFORE INSERT OR UPDATE OR DELETE ON hosting_reclamations FOR EACH ROW EXECUTE FUNCTION protect_hosting_reclamation();
