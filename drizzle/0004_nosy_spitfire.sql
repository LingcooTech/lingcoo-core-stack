CREATE TYPE "public"."app_type" AS ENUM('chrome_extension', 'web_app', 'service');--> statement-breakpoint
CREATE TYPE "public"."checkout_action_type" AS ENUM('qr_code', 'redirect_url');--> statement-breakpoint
CREATE TYPE "public"."checkout_session_status" AS ENUM('pending', 'paid', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_attempt_status" AS ENUM('prepared', 'paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "app_products" (
	"app_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_products_app_id_product_id_pk" PRIMARY KEY("app_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "app_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"secret_hash" varchar(255) NOT NULL,
	"hint" varchar(16) NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(255),
	"type" "app_type" DEFAULT 'chrome_extension' NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apps_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_code" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"status" "checkout_session_status" DEFAULT 'pending' NOT NULL,
	"action_type" "checkout_action_type" NOT NULL,
	"action_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"success_url" varchar(2048),
	"cancel_url" varchar(2048),
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_sessions_session_code_unique" UNIQUE("session_code"),
	CONSTRAINT "checkout_sessions_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkout_session_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"action_type" "checkout_action_type" NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'prepared' NOT NULL,
	"provider_reference" varchar(128),
	"request_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_products" ADD CONSTRAINT "app_products_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_products" ADD CONSTRAINT "app_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_secrets" ADD CONSTRAINT "app_secrets_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_session_attempt_idx" ON "payment_attempts" USING btree ("checkout_session_id","attempt_no");