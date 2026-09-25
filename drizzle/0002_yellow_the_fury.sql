CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_auth" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_auth_single_row" CHECK ("site_auth"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");