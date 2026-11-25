CREATE TABLE `searches` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`indicator` text,
	`domain` text,
	`round` integer NOT NULL,
	`angle` text,
	`query` text NOT NULL,
	`engine` text NOT NULL,
	`hits` integer NOT NULL,
	`fresh` integer NOT NULL,
	`urls` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `searches_project` ON `searches` (`project_id`);