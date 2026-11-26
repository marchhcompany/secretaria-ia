CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"delay" integer DEFAULT 24 NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"template_name" text DEFAULT '' NOT NULL,
	"template_language" text DEFAULT 'pt_BR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_rules_business_id_kind_unique" UNIQUE("business_id","kind")
);
--> statement-breakpoint
CREATE TABLE "scheduled_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"conversation_id" uuid,
	"appointment_id" uuid,
	"kind" text NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"template_name" text DEFAULT '' NOT NULL,
	"template_language" text DEFAULT 'pt_BR' NOT NULL,
	"template_params" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cancel_on_reply" boolean DEFAULT true NOT NULL,
	"result" text DEFAULT '' NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "whatsapp_waba_id" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "whatsapp_access_token_enc" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "ai_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "hide_prices" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "payment_info" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "conversion_goal" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "qualification_questions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "booking_mode" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "ai_model" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "ai_monthly_budget_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "automations_live" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "notify_emails" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "handoff_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ai_context_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "lead_stage" text DEFAULT 'novo' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "interest" text DEFAULT 'desconhecido' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "business_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "need" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "opted_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "opted_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "marketing_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_inbound_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "pending_ai" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "wa_message_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivery_status" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "author_user_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_business_id_created_at_index" ON "ai_usage" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_conversation_id_index" ON "ai_usage" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "scheduled_messages_status_run_at_index" ON "scheduled_messages" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "scheduled_messages_business_id_created_at_index" ON "scheduled_messages" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "scheduled_messages_customer_id_status_index" ON "scheduled_messages" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "customers_business_id_lead_stage_index" ON "customers" USING btree ("business_id","lead_stage");--> statement-breakpoint
CREATE INDEX "messages_wa_message_id_index" ON "messages" USING btree ("wa_message_id");