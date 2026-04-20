DO $$ BEGIN
  CREATE TYPE "support_ticket_status" AS ENUM ('waiting_staff', 'waiting_user', 'resolved', 'closed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "support_ticket_priority" AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "support_ticket_category" AS ENUM ('account', 'billing', 'access', 'install', 'deployment', 'bug', 'feature', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "support_ticket_message_author_type" AS ENUM ('user', 'admin', 'system');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE "support_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_no" varchar(64) NOT NULL,
  "user_id" uuid NOT NULL,
  "app_id" uuid,
  "order_id" uuid,
  "install_id" uuid,
  "deployment_id" uuid,
  "category" "support_ticket_category" DEFAULT 'other' NOT NULL,
  "priority" "support_ticket_priority" DEFAULT 'normal' NOT NULL,
  "status" "support_ticket_status" DEFAULT 'waiting_staff' NOT NULL,
  "subject" varchar(200) NOT NULL,
  "assigned_admin_user_id" uuid,
  "last_reply_author_type" "support_ticket_message_author_type" DEFAULT 'user' NOT NULL,
  "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
  "first_responded_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_tickets_ticket_no_unique" UNIQUE("ticket_no")
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "author_user_id" uuid,
  "author_type" "support_ticket_message_author_type" NOT NULL,
  "is_internal" boolean DEFAULT false NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_app_id_apps_id_fk"
  FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_install_id_installs_id_fk"
  FOREIGN KEY ("install_id") REFERENCES "public"."installs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_deployment_id_deployments_id_fk"
  FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_admin_user_id_users_id_fk"
  FOREIGN KEY ("assigned_admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk"
  FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_user_id_users_id_fk"
  FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX "support_tickets_user_status_last_activity_idx" ON "support_tickets" USING btree ("user_id","status","last_activity_at");
--> statement-breakpoint
CREATE INDEX "support_tickets_status_priority_last_activity_idx" ON "support_tickets" USING btree ("status","priority","last_activity_at");
--> statement-breakpoint
CREATE INDEX "support_tickets_app_id_idx" ON "support_tickets" USING btree ("app_id");
--> statement-breakpoint
CREATE INDEX "support_tickets_assigned_admin_user_id_idx" ON "support_tickets" USING btree ("assigned_admin_user_id");
--> statement-breakpoint
CREATE INDEX "support_ticket_messages_ticket_created_idx" ON "support_ticket_messages" USING btree ("ticket_id","created_at");
--> statement-breakpoint
CREATE INDEX "support_ticket_messages_author_user_id_idx" ON "support_ticket_messages" USING btree ("author_user_id");
