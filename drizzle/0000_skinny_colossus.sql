CREATE TABLE `jeffrey_feedback` (
	`user_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`kind` text NOT NULL,
	`action` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `recommendation_id`)
);
--> statement-breakpoint
CREATE TABLE `jeffrey_scans` (
	`user_id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	`result` text
);
