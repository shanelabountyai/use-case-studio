CREATE TABLE "kickoff_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "build_kickoff_plan" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "kickoff_feedback" ADD CONSTRAINT "kickoff_feedback_job_id_build_kickoff_plan_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."build_kickoff_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kickoff_feedback" ADD CONSTRAINT "kickoff_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kfb_job_idx" ON "kickoff_feedback" USING btree ("job_id");