CREATE TABLE "whatsapp_inbound" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "whatsapp_phone_number_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_inbound" ADD CONSTRAINT "whatsapp_inbound_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_whatsapp_phone_number_id_unique" UNIQUE("whatsapp_phone_number_id");