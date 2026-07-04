PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_channels`("id", "type", "name", "config", "enabled", "is_default", "created_at", "updated_at") SELECT "id", "type", "name", "config", "enabled", "is_default", "created_at", "updated_at" FROM `channels`;--> statement-breakpoint
DROP TABLE `channels`;--> statement-breakpoint
ALTER TABLE `__new_channels` RENAME TO `channels`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer,
	`channel_type` text NOT NULL,
	`channel_id` text,
	`to_address` text NOT NULL,
	`subject` text,
	`body` text,
	`template_id` text,
	`template_vars` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 5 NOT NULL,
	`next_retry_at` integer,
	`error_message` text,
	`idempotency_key` text,
	`scheduled_at` integer,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_messages`("id", "user_id", "channel_type", "channel_id", "to_address", "subject", "body", "template_id", "template_vars", "status", "retry_count", "max_retries", "next_retry_at", "error_message", "idempotency_key", "scheduled_at", "sent_at", "created_at") SELECT "id", "user_id", "channel_type", "channel_id", "to_address", "subject", "body", "template_id", "template_vars", "status", "retry_count", "max_retries", "next_retry_at", "error_message", "idempotency_key", "scheduled_at", "sent_at", "created_at" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_idempotency_key_unique` ON `messages` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_messages_status` ON `messages` (`status`);--> statement-breakpoint
CREATE INDEX `idx_messages_created` ON `messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_messages_next_retry` ON `messages` (`next_retry_at`);--> statement-breakpoint
CREATE TABLE `__new_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`channel_type` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`variables` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_templates`("id", "name", "channel_type", "subject", "body", "variables", "created_at") SELECT "id", "name", "channel_type", "subject", "body", "variables", "created_at" FROM `templates`;--> statement-breakpoint
DROP TABLE `templates`;--> statement-breakpoint
ALTER TABLE `__new_templates` RENAME TO `templates`;--> statement-breakpoint
CREATE UNIQUE INDEX `templates_name_unique` ON `templates` (`name`);