ALTER TABLE `messages` ADD `tags` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `messages` ADD `priority` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `url` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `attachment` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `format` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `push_messages` ADD `tags` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `push_messages` ADD `priority` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `push_messages` ADD `url` text;--> statement-breakpoint
ALTER TABLE `push_messages` ADD `attachment` text;--> statement-breakpoint
ALTER TABLE `push_messages` ADD `format` text DEFAULT 'text' NOT NULL;