CREATE TABLE "order_item_refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"provider_refund_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_item_refunds_valid" CHECK ("order_item_refunds"."kind" in ('software','hosting') and "order_item_refunds"."status" in ('pending','succeeded','failed') and "order_item_refunds"."amount">0)
);
--> statement-breakpoint
ALTER TABLE "order_item_refunds" ADD CONSTRAINT "order_item_refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_refunds" ADD CONSTRAINT "order_item_refunds_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;