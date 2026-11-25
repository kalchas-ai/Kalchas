CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`card_id` text NOT NULL,
	`card` text NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`picked` integer NOT NULL,
	`text` text,
	`means` text NOT NULL,
	`guess` integer NOT NULL,
	`hit` integer NOT NULL,
	`about` text NOT NULL,
	`topic` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reactions_project` ON `reactions` (`project_id`,`card_id`);--> statement-breakpoint
CREATE INDEX `reactions_about` ON `reactions` (`about`,`created_at`);