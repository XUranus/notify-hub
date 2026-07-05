CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`icon` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_topics_user_id` ON `topics` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_topics_user_id_name` ON `topics` (`user_id`,`name`);--> statement-breakpoint
ALTER TABLE `messages` ADD `topic_id` text;--> statement-breakpoint
CREATE INDEX `idx_messages_topic_id` ON `messages` (`topic_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_user_id_topic` ON `messages` (`user_id`,`topic_id`);--> statement-breakpoint
ALTER TABLE `push_messages` ADD `user_id` integer;--> statement-breakpoint
ALTER TABLE `push_messages` ADD `topic_id` text;--> statement-breakpoint
CREATE INDEX `idx_push_messages_topic_id` ON `push_messages` (`topic_id`);
