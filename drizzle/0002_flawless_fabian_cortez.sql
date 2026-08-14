CREATE TABLE `upload_rate_limits` (
	`client_hash` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`attempt_count` integer NOT NULL
);
