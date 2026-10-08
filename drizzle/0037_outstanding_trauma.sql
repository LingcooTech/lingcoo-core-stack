CREATE TABLE "hosting_fulfillments" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"status" varchar(16) NOT NULL,
	"reason" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosting_fulfillments_status_check" CHECK ("hosting_fulfillments"."status" in ('applied', 'review', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "hosting_fulfillments" ADD CONSTRAINT "hosting_fulfillments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;