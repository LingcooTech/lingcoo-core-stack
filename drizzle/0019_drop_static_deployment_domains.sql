ALTER TABLE "deployments" DROP COLUMN IF EXISTS "primary_domain";
--> statement-breakpoint
ALTER TABLE "deployments" DROP COLUMN IF EXISTS "admin_domain";
--> statement-breakpoint
ALTER TABLE "deployments" DROP COLUMN IF EXISTS "ws_domain";
