ALTER TABLE `forecasts` ADD `setup` text;--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`step` integer NOT NULL,
	`sim_time` text NOT NULL,
	`form` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`stakes` text NOT NULL,
	`people` text NOT NULL,
	`you_know` text NOT NULL,
	`standard` text NOT NULL,
	`status` text NOT NULL,
	`turns` text NOT NULL,
	`result` text,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `meetings_branch` ON `meetings` (`branch_id`,`step`);--> statement-breakpoint
CREATE TABLE `base_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`variable` text NOT NULL,
	`conditions` text NOT NULL,
	`key` text NOT NULL,
	`data` text NOT NULL,
	`source` text NOT NULL,
	`url` text,
	`year` integer,
	`estimated` integer NOT NULL,
	`looked_up_at` text NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `base_key` ON `base_records` (`kind`,`key`);
