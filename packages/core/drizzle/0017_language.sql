ALTER TABLE `worlds` ADD `language` text;--> statement-breakpoint
UPDATE `worlds` SET `language` = 'zh-Hans';
