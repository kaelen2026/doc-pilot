CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_chunk_id" uuid NOT NULL,
	"quote" text NOT NULL,
	"claim" text,
	"page_start" integer,
	"page_end" integer,
	"score" numeric(8, 6),
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"title" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"client_request_id" varchar(100),
	"parent_message_id" uuid,
	"generation_id" uuid,
	"error_code" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_conversation_request_unique" UNIQUE("conversation_id","client_request_id")
);
--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_document_chunk_id_document_chunks_id_fk" FOREIGN KEY ("document_chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_message_id_messages_id_fk" FOREIGN KEY ("parent_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citations_message_idx" ON "citations" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "conversations_workspace_document_idx" ON "conversations" USING btree ("workspace_id","document_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chunks_embedding_hnsw" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);