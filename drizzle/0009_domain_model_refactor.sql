-- 0009_domain_model_refactor.sql
-- App absorbs Product: eliminate products/app_products tables,
-- promote offers to app_offers table, change entitlements to per-plan granularity.

-- ============================================================
-- Phase 1: Create app_offers table
-- ============================================================

CREATE TABLE app_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  badge VARCHAR(64),
  price_amount INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(app_id, code)
);

-- ============================================================
-- Phase 2: Migrate offer data from apps.meta JSON to app_offers
-- ============================================================

INSERT INTO app_offers (app_id, plan_id, code, title, description, badge, price_amount, currency, is_default, sort_order, status)
SELECT
  a.id,
  p.id,
  offer->>'code',
  COALESCE(offer->>'title', p.name),
  offer->>'description',
  offer->>'badge',
  COALESCE((offer->>'priceAmount')::int, p.price_amount),
  COALESCE(NULLIF(offer->>'currency', ''), p.currency),
  COALESCE((offer->>'isDefault')::boolean, false),
  COALESCE((offer->>'sortOrder')::int, idx::int),
  COALESCE(offer->>'status', 'active')::record_status
FROM apps a,
     jsonb_array_elements(a.meta->'checkoutOffers') WITH ORDINALITY AS t(offer, idx)
JOIN plans p ON p.code = offer->>'planCode'
WHERE a.meta ? 'checkoutOffers'
  AND jsonb_typeof(a.meta->'checkoutOffers') = 'array';

-- ============================================================
-- Phase 3: Add new nullable columns
-- ============================================================

ALTER TABLE plans ADD COLUMN app_id UUID;
ALTER TABLE features ADD COLUMN app_id UUID;
ALTER TABLE entitlements ADD COLUMN app_id UUID;
ALTER TABLE entitlements ADD COLUMN plan_id UUID;
ALTER TABLE orders ADD COLUMN app_id UUID;
ALTER TABLE events ADD COLUMN app_id UUID;

-- ============================================================
-- Phase 4: Backfill new columns from existing data
-- ============================================================

-- plans.app_id via products → app_products
UPDATE plans SET app_id = ap.app_id
FROM app_products ap WHERE plans.product_id = ap.product_id;

-- features.app_id via products → app_products
UPDATE features SET app_id = ap.app_id
FROM app_products ap WHERE features.product_id = ap.product_id;

-- entitlements.app_id via products → app_products
UPDATE entitlements SET app_id = ap.app_id
FROM app_products ap WHERE entitlements.product_id = ap.product_id;

-- entitlements.plan_id from meta->>'planId'
UPDATE entitlements SET plan_id = (meta->>'planId')::uuid
WHERE meta->>'planId' IS NOT NULL;

-- Collapse per-feature entitlements into per-plan:
-- Keep one row per (user_id, app_id, plan_id, source_type, source_id), delete the rest
DELETE FROM entitlements
WHERE plan_id IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (user_id, app_id, plan_id, source_type, source_id) id
    FROM entitlements
    WHERE plan_id IS NOT NULL
    ORDER BY user_id, app_id, plan_id, source_type, source_id, created_at ASC
  );

-- orders.app_id via checkout_sessions
UPDATE orders o SET app_id = cs.app_id
FROM checkout_sessions cs WHERE cs.order_id = o.id;

-- Fallback: orders.app_id via meta->>'appCode'
UPDATE orders o SET app_id = a.id
FROM apps a WHERE o.app_id IS NULL AND o.meta->>'appCode' = a.code;

-- events.app_id via products → app_products
UPDATE events e SET app_id = ap.app_id
FROM app_products ap WHERE e.product_id = ap.product_id;

-- ============================================================
-- Phase 5: Set NOT NULL constraints and add foreign keys
-- ============================================================

ALTER TABLE plans ALTER COLUMN app_id SET NOT NULL;
ALTER TABLE plans ADD CONSTRAINT plans_app_id_fkey
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE;

ALTER TABLE features ALTER COLUMN app_id SET NOT NULL;
ALTER TABLE features ADD CONSTRAINT features_app_id_fkey
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE;

ALTER TABLE entitlements ALTER COLUMN app_id SET NOT NULL;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_app_id_fkey
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE;
ALTER TABLE entitlements ALTER COLUMN plan_id SET NOT NULL;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_plan_id_fkey
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT;

ALTER TABLE orders ALTER COLUMN app_id SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_app_id_fkey
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE RESTRICT;

ALTER TABLE installs ALTER COLUMN app_id SET NOT NULL;

-- ============================================================
-- Phase 6: Drop old columns
-- ============================================================

ALTER TABLE plans DROP COLUMN product_id;
ALTER TABLE features DROP COLUMN product_id;
ALTER TABLE entitlements DROP COLUMN product_id;
ALTER TABLE entitlements DROP COLUMN feature_id;
ALTER TABLE orders DROP COLUMN product_id;
ALTER TABLE checkout_sessions DROP COLUMN product_id;
ALTER TABLE installs DROP COLUMN product_id;
ALTER TABLE deployments DROP COLUMN product_id;
ALTER TABLE events DROP COLUMN product_id;

-- ============================================================
-- Phase 7: Drop old tables
-- ============================================================

DROP TABLE IF EXISTS app_products;
DROP TABLE IF EXISTS products;

-- ============================================================
-- Phase 8: Drop old enum
-- ============================================================

DROP TYPE IF EXISTS product_type;

-- ============================================================
-- Phase 9: Clean up apps.meta offer JSON keys
-- ============================================================

UPDATE apps SET meta = meta - 'checkoutOffers' - 'checkoutDefaultOfferCode' - 'checkoutPlanCode'
WHERE meta ? 'checkoutOffers' OR meta ? 'checkoutDefaultOfferCode' OR meta ? 'checkoutPlanCode';
