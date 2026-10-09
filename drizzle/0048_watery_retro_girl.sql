CREATE TABLE "storage_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid,
	"display_name" varchar(200) NOT NULL,
	"alt_text" text,
	"visibility" varchar(20) DEFAULT 'private' NOT NULL,
	"media_kind" varchar(20) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_assets_visibility_check" CHECK ("storage_assets"."visibility" in ('public', 'private')),
	CONSTRAINT "storage_assets_kind_check" CHECK ("storage_assets"."media_kind" in ('image', 'document', 'text')),
	CONSTRAINT "storage_assets_version_check" CHECK ("storage_assets"."revision" > 0 and "storage_assets"."current_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "storage_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"object_key" text NOT NULL,
	"bucket" varchar(255) NOT NULL,
	"endpoint" text NOT NULL,
	"region" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" varchar(64) DEFAULT '' NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_objects_status_check" CHECK ("storage_objects"."status" in ('pending', 'writing', 'ready', 'deletion_pending', 'deleted', 'failed')),
	CONSTRAINT "storage_objects_size_check" CHECK ("storage_objects"."size_bytes" > 0 and "storage_objects"."size_bytes" <= 26214400 and "storage_objects"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "storage_references" (
	"asset_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	CONSTRAINT "storage_references_asset_id_owner_type_owner_id_pk" PRIMARY KEY("asset_id","owner_type","owner_id")
);
--> statement-breakpoint
ALTER TABLE "storage_assets" ADD CONSTRAINT "storage_assets_folder_id_storage_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."storage_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_asset_id_storage_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."storage_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_references" ADD CONSTRAINT "storage_references_asset_id_storage_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."storage_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_assets_folder_idx" ON "storage_assets" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "storage_assets_created_idx" ON "storage_assets" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_folders_name_uidx" ON "storage_folders" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_asset_version_uidx" ON "storage_objects" USING btree ("asset_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_key_uidx" ON "storage_objects" USING btree ("bucket","endpoint","object_key");--> statement-breakpoint
CREATE INDEX "storage_objects_cleanup_idx" ON "storage_objects" USING btree ("status","expires_at");
--> statement-breakpoint
-- Existing business URL fields remain compatible. Register platform-owned asset URLs transactionally,
-- including URLs embedded in rich text and screenshots; protect references under the same advisory lock as deletion.
CREATE FUNCTION sync_stack_storage_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payload jsonb; ref_owner text; ref_asset uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN payload := to_jsonb(OLD); ELSE payload := to_jsonb(NEW); END IF;
  ref_owner := COALESCE(payload->>'id', payload->>'key');
  -- Encrypted settings cannot contain media references. Avoid scanning credentials or ciphertext.
  IF TG_TABLE_NAME = 'system_settings' AND COALESCE((payload->>'is_encrypted')::boolean, false) THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('storage:references', 0));
  DELETE FROM storage_references WHERE owner_type = TG_TABLE_NAME AND owner_id = ref_owner;
  IF TG_OP <> 'DELETE' THEN
    FOR ref_asset IN SELECT DISTINCT (m[1])::uuid FROM regexp_matches(payload::text, '/v1/assets/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/content', 'g') AS m LOOP
      IF NOT EXISTS (SELECT 1 FROM storage_assets WHERE id = ref_asset) THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM storage_assets WHERE id = ref_asset AND deleted_at IS NULL AND visibility = 'public' AND current_version > 0) THEN
        RAISE EXCEPTION 'Referenced storage asset must be active and public' USING ERRCODE = '23514';
      END IF;
      INSERT INTO storage_references(asset_id, owner_type, owner_id) VALUES(ref_asset, TG_TABLE_NAME, ref_owner);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

--> statement-breakpoint
CREATE TRIGGER apps_storage_references AFTER INSERT OR UPDATE OR DELETE ON apps FOR EACH ROW EXECUTE FUNCTION sync_stack_storage_references();

--> statement-breakpoint
CREATE TRIGGER content_items_storage_references AFTER INSERT OR UPDATE OR DELETE ON content_items FOR EACH ROW EXECUTE FUNCTION sync_stack_storage_references();

--> statement-breakpoint
CREATE TRIGGER doc_spaces_storage_references AFTER INSERT OR UPDATE OR DELETE ON doc_spaces FOR EACH ROW EXECUTE FUNCTION sync_stack_storage_references();

--> statement-breakpoint
CREATE TRIGGER doc_pages_storage_references AFTER INSERT OR UPDATE OR DELETE ON doc_pages FOR EACH ROW EXECUTE FUNCTION sync_stack_storage_references();

--> statement-breakpoint
CREATE TRIGGER system_settings_storage_references AFTER INSERT OR UPDATE OR DELETE ON system_settings FOR EACH ROW EXECUTE FUNCTION sync_stack_storage_references();
