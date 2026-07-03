PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_type` text NOT NULL,
	`channel_id` integer,
	`to_address` text NOT NULL,
	`subject` text,
	`body` text,
	`template_id` integer,
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
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_messages`("id", "channel_type", "channel_id", "to_address", "subject", "body", "template_id", "template_vars", "status", "retry_count", "max_retries", "next_retry_at", "error_message", "idempotency_key", "scheduled_at", "sent_at", "created_at") SELECT "id", "channel_type", "channel_id", "to_address", "subject", "body", "template_id", "template_vars", "status", "retry_count", "max_retries", "next_retry_at", "error_message", "idempotency_key", "scheduled_at", "sent_at", "created_at" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_idempotency_key_unique` ON `messages` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_messages_status` ON `messages` (`status`);--> statement-breakpoint
CREATE INDEX `idx_messages_created` ON `messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_messages_next_retry` ON `messages` (`next_retry_at`);