CREATE TABLE `forecast_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`version` integer,
	`changed` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `forecast_messages_project` ON `forecast_messages` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `forecast_revisits` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`what` text NOT NULL,
	`why` text NOT NULL,
	`due_at` text NOT NULL,
	`status` text NOT NULL,
	`verdict` text,
	`result` text,
	`checked_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `forecast_revisits_project` ON `forecast_revisits` (`project_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `forecast_versions` (
	`project_id` text NOT NULL,
	`n` integer NOT NULL,
	`board` text NOT NULL,
	`changed` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `n`)
);
--> statement-breakpoint
CREATE TABLE `forecasts` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`clarify` text NOT NULL,
	`as_of` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `intel` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`domain` text NOT NULL,
	`date` text,
	`date_label` text NOT NULL,
	`status` text NOT NULL,
	`impact` text NOT NULL,
	`relevance` real NOT NULL,
	`source_id` text,
	`quote` text,
	`confidence` real NOT NULL,
	`version` integer NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `intel_project` ON `intel` (`project_id`);--> statement-breakpoint
ALTER TABLE `worlds` ADD `kind` text DEFAULT 'replay' NOT NULL;