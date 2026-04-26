ALTER TABLE "deployments" ADD COLUMN "entitlement_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "deployments" ADD CONSTRAINT "deployments_entitlement_id_entitlements_id_fk"
  FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX "deployments_entitlement_id_idx" ON "deployments" USING btree ("entitlement_id");
