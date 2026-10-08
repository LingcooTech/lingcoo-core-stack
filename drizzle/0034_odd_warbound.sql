ALTER TABLE "orders" ADD COLUMN "items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Order snapshots are append-only purchase evidence. Legacy [] is deliberately not backfilled.
CREATE FUNCTION protect_order_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  item jsonb;
  total bigint := 0;
  kinds text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.items IS DISTINCT FROM OLD.items OR
       (OLD.items <> '[]'::jsonb AND
        (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency OR
         NEW.app_id IS DISTINCT FROM OLD.app_id OR NEW.plan_id IS DISTINCT FROM OLD.plan_id)) THEN
      RAISE EXCEPTION 'Order purchase snapshot is immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.items) <> 'array' OR jsonb_array_length(NEW.items) > 2 THEN
    RAISE EXCEPTION 'Invalid order items';
  END IF;
  IF NEW.items = '[]'::jsonb THEN RETURN NEW; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
    IF (item->>'kind') IS NULL OR (item->>'kind') NOT IN ('software', 'hosting') OR
       (item->>'kind') = ANY(kinds) OR
       (item->>'currency') IS DISTINCT FROM NEW.currency OR
       (item->>'quantity') IS NULL OR (item->>'quantity')::bigint NOT BETWEEN 1 AND 120 OR
       (item->>'unitAmount') IS NULL OR (item->>'unitAmount')::bigint < 0 OR
       (item->>'amount') IS NULL OR
       (item->>'amount')::bigint <> (item->>'quantity')::bigint * (item->>'unitAmount')::bigint THEN
      RAISE EXCEPTION 'Invalid order item totals or currency';
    END IF;
    total := total + (item->>'amount')::bigint;
    kinds := array_append(kinds, item->>'kind');
  END LOOP;
  IF total <> NEW.amount OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Invalid order item total';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER orders_purchase_snapshot_guard BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION protect_order_items();
