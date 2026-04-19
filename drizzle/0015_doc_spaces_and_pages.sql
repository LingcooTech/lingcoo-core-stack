DO $$ BEGIN
  CREATE TYPE "doc_space_type" AS ENUM ('product', 'app', 'internal');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "doc_space_status" AS ENUM ('active', 'hidden', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "doc_page_status" AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE "doc_spaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(160) NOT NULL,
  "title" varchar(200) NOT NULL,
  "description" text,
  "icon_url" varchar(500),
  "type" "doc_space_type" DEFAULT 'product' NOT NULL,
  "app_id" uuid,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" "doc_space_status" DEFAULT 'active' NOT NULL,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "doc_spaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "doc_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "space_id" uuid NOT NULL,
  "parent_id" uuid,
  "slug" varchar(160) NOT NULL,
  "path" varchar(500) NOT NULL,
  "title" varchar(200) NOT NULL,
  "summary" text,
  "content" text DEFAULT '' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" "doc_page_status" DEFAULT 'draft' NOT NULL,
  "published_at" timestamp with time zone,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "doc_spaces" ADD CONSTRAINT "doc_spaces_app_id_apps_id_fk"
  FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "doc_pages" ADD CONSTRAINT "doc_pages_space_id_doc_spaces_id_fk"
  FOREIGN KEY ("space_id") REFERENCES "public"."doc_spaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "doc_pages" ADD CONSTRAINT "doc_pages_parent_id_doc_pages_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "public"."doc_pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX "doc_spaces_app_id_idx" ON "doc_spaces" USING btree ("app_id");
--> statement-breakpoint
CREATE INDEX "doc_spaces_status_sort_idx" ON "doc_spaces" USING btree ("status","sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX "doc_pages_space_path_unique_idx" ON "doc_pages" USING btree ("space_id","path");
--> statement-breakpoint
CREATE INDEX "doc_pages_space_parent_sort_idx" ON "doc_pages" USING btree ("space_id","parent_id","sort_order");
--> statement-breakpoint
CREATE INDEX "doc_pages_status_published_idx" ON "doc_pages" USING btree ("status","published_at");
