CREATE INDEX "order_item_refunds_order_idx" ON "order_item_refunds" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE FUNCTION enforce_item_refund_immutability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'refund ledger records cannot be deleted';
  END IF;
  IF ROW(NEW.id,NEW.order_id,NEW.kind,NEW.amount,NEW.reason,NEW.actor_id,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.order_id,OLD.kind,OLD.amount,OLD.reason,OLD.actor_id,OLD.created_at) THEN
    RAISE EXCEPTION 'refund request identity and amounts are immutable';
  END IF;
  IF OLD.status <> 'pending' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'terminal refund status cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER order_item_refunds_immutable BEFORE UPDATE OR DELETE ON order_item_refunds
FOR EACH ROW EXECUTE FUNCTION enforce_item_refund_immutability();
