-- Reconcile the historical migration schema with the maintained generation baseline.
-- Refuse orphaned events rather than silently modifying business data.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM events e LEFT JOIN apps a ON a.id=e.app_id WHERE e.app_id IS NOT NULL AND a.id IS NULL) THEN
    RAISE EXCEPTION 'events contain orphan app_id values; reconcile historical data before retrying migration 0028';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "app_offers" RENAME CONSTRAINT "app_offers_app_id_fkey" TO "app_offers_app_id_apps_id_fk";
--> statement-breakpoint
ALTER TABLE "app_offers" RENAME CONSTRAINT "app_offers_plan_id_fkey" TO "app_offers_plan_id_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "auth_sessions" RENAME CONSTRAINT "auth_sessions_user_id_fkey" TO "auth_sessions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "entitlements" RENAME CONSTRAINT "entitlements_app_id_fkey" TO "entitlements_app_id_apps_id_fk";
--> statement-breakpoint
ALTER TABLE "entitlements" RENAME CONSTRAINT "entitlements_plan_id_fkey" TO "entitlements_plan_id_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "features" RENAME CONSTRAINT "features_app_id_fkey" TO "features_app_id_apps_id_fk";
--> statement-breakpoint
ALTER TABLE "job_attempts" RENAME CONSTRAINT "job_attempts_job_id_fkey" TO "job_attempts_job_id_job_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" RENAME CONSTRAINT "orders_app_id_fkey" TO "orders_app_id_apps_id_fk";
--> statement-breakpoint
ALTER TABLE "plans" RENAME CONSTRAINT "plans_app_id_fkey" TO "plans_app_id_apps_id_fk";
--> statement-breakpoint
ALTER TABLE "auth_sessions" RENAME CONSTRAINT "auth_sessions_token_digest_key" TO "auth_sessions_token_digest_unique";
--> statement-breakpoint
ALTER TABLE "idempotency_requests" RENAME CONSTRAINT "idempotency_requests_scope_digest_key" TO "idempotency_requests_scope_digest_unique";
--> statement-breakpoint
ALTER TABLE "job_attempts" RENAME CONSTRAINT "job_attempts_claim_token_key" TO "job_attempts_claim_token_unique";
--> statement-breakpoint
ALTER TABLE "installs" DROP CONSTRAINT "installs_app_id_apps_id_fk";
--> statement-breakpoint
ALTER TABLE "installs" ADD CONSTRAINT "installs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE SET NULL;
