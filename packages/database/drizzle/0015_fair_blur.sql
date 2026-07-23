CREATE TABLE "pending_object_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"bucket" varchar(255) NOT NULL,
	"object_key" varchar(1024) NOT NULL,
	"size_bytes" bigint,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deletion_scheduled_at" timestamp;--> statement-breakpoint
CREATE INDEX "pending_object_deletions_scan_idx" ON "pending_object_deletions" USING btree ("attempts","created_at");--> statement-breakpoint
CREATE INDEX "user_deletion_scheduled_idx" ON "user" USING btree ("deletion_scheduled_at") WHERE "user"."deletion_scheduled_at" is not null;