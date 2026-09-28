ALTER TABLE "visits" ADD COLUMN "legacy_entry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "backdated" boolean DEFAULT false NOT NULL;