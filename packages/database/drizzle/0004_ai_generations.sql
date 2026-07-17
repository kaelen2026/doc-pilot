CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"document_id" uuid,
	"capability" varchar(50) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"prompt_id" varchar(100),
	"prompt_version" varchar(50),
	"status" varchar(30) NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_tokens" integer,
	"cost_micros" bigint,
	"latency_ms" integer,
	"time_to_first_token_ms" integer,
	"trace_id" varchar(100) NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_workspace_idx" ON "ai_generations" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_generations_document_idx" ON "ai_generations" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "ai_generations_capability_idx" ON "ai_generations" USING btree ("capability","created_at");