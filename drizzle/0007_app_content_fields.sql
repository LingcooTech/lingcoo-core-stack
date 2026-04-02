ALTER TABLE "apps" ADD COLUMN "tagline" varchar(200);--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "icon_url" varchar(500);--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "cover_url" varchar(500);--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "screenshots" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "highlights" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "faq" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "category" varchar(64);--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ALTER COLUMN "description" SET DATA TYPE text;--> statement-breakpoint
