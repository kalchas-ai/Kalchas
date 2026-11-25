ALTER TABLE `llm_calls` ADD `run` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `attempt` integer;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `lane` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `finish_reason` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `reasoning_tokens` integer;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `thinking` text;--> statement-breakpoint
CREATE INDEX `llm_calls_run` ON `llm_calls` (`run`);
