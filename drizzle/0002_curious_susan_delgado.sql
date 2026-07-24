ALTER TABLE "build_kickoff_plan" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "build_kickoff_plan" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "build_kickoff_plan" ADD COLUMN "lease_until" timestamp;