CREATE TABLE "hosting_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"item" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'available' NOT NULL,
	"deployment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosting_purchases_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "hosting_purchases_deployment_id_unique" UNIQUE("deployment_id"),
	CONSTRAINT "hosting_purchases_state_check" CHECK ("hosting_purchases"."status" in ('available', 'bound', 'refund_pending', 'revoked') and (("hosting_purchases"."status" = 'bound' and "hosting_purchases"."deployment_id" is not null) or ("hosting_purchases"."status" <> 'bound' and "hosting_purchases"."deployment_id" is null)))
);
--> statement-breakpoint
ALTER TABLE "hosting_services" DROP CONSTRAINT "hosting_services_validity";--> statement-breakpoint
ALTER TABLE "hosting_purchases" ADD CONSTRAINT "hosting_purchases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_purchases" ADD CONSTRAINT "hosting_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_purchases" ADD CONSTRAINT "hosting_purchases_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_services" ADD CONSTRAINT "hosting_services_validity" CHECK ("hosting_services"."periods" between 1 and 1200 and "hosting_services"."version" > 0 and "hosting_services"."grace_days" between 0 and 90 and "hosting_services"."retention_days" between 1 and 3650 and "hosting_services"."source" in ('trial', 'manual', 'paid') and "hosting_services"."interval" in ('month', 'year') and (("hosting_services"."anchor_at" is null and "hosting_services"."expires_at" is null) or ("hosting_services"."anchor_at" is not null and "hosting_services"."expires_at" is not null and "hosting_services"."expires_at" > "hosting_services"."anchor_at")));