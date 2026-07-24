CREATE TABLE "build_kickoff_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"plan" jsonb,
	"audit" jsonb,
	"lane_status" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"cost" jsonb,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "build_kickoff_plan" ADD CONSTRAINT "build_kickoff_plan_case_id_use_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."use_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_kickoff_plan" ADD CONSTRAINT "build_kickoff_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bkp_case_version_idx" ON "build_kickoff_plan" USING btree ("case_id","version");--> statement-breakpoint
CREATE INDEX "bkp_user_idx" ON "build_kickoff_plan" USING btree ("user_id");