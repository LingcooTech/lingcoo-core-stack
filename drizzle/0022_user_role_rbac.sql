ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'support';
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'finance';
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'editor';
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'operator';
