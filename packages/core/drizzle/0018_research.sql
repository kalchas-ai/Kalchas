ALTER TABLE `forecasts` ADD `knowledge` text;--> statement-breakpoint
ALTER TABLE `forecasts` DROP COLUMN `indicators`;--> statement-breakpoint
DROP TABLE `intel`;--> statement-breakpoint
CREATE TABLE `intel` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`item` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`quote` text NOT NULL,
	`date` text,
	`date_label` text NOT NULL,
	`status` text NOT NULL,
	`solid` text NOT NULL,
	`source_id` text,
	`source_name` text,
	`version` integer NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `intel_project` ON `intel` (`project_id`);--> statement-breakpoint
DROP TABLE `searches`;--> statement-breakpoint
CREATE TABLE `searches` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`item` text,
	`round` integer NOT NULL,
	`query` text NOT NULL,
	`engine` text NOT NULL,
	`hits` integer NOT NULL,
	`fresh` integer NOT NULL,
	`urls` text NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `searches_project` ON `searches` (`project_id`);--> statement-breakpoint
DROP TABLE `reactions`;
