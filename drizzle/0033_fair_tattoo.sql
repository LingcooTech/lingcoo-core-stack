CREATE TABLE "hosting_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"app_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"interval" varchar(16) NOT NULL,
	"price_amount" integer NOT NULL,
	"currency" varchar(16) DEFAULT 'CNY' NOT NULL,
	"grace_days" integer NOT NULL,
	"retention_days" integer NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosting_offers_terms_check" CHECK ("hosting_offers"."interval" IN ('month', 'year') AND "hosting_offers"."currency" = 'CNY' AND "hosting_offers"."price_amount" BETWEEN 0 AND 100000000 AND "hosting_offers"."grace_days" BETWEEN 0 AND 90 AND "hosting_offers"."retention_days" BETWEEN 1 AND 3650 AND "hosting_offers"."version" > 0),
	CONSTRAINT "hosting_offers_status_check" CHECK ("hosting_offers"."status" IN ('draft', 'active', 'archived') AND ("hosting_offers"."status" <> 'active' OR "hosting_offers"."price_amount" > 0))
);
--> statement-breakpoint
ALTER TABLE "hosting_offers" ADD CONSTRAINT "hosting_offers_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hosting_offers_app_code_idx" ON "hosting_offers" USING btree ("app_id","code");