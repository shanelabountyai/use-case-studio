CREATE TABLE "rate_limit" (
	"key" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_key_window_start_pk" PRIMARY KEY("key","window_start")
);
