CREATE INDEX `idx_attachments_expires_at` ON `attachments` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_attachments_user_id` ON `attachments` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_channels_type_default` ON `channels` (`type`,`is_default`);--> statement-breakpoint
CREATE INDEX `idx_messages_user_id` ON `messages` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_user_id_status` ON `messages` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_messages_user_id_created` ON `messages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_messages_channel_type_status` ON `messages` (`channel_type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_push_clients_user_id` ON `push_clients` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_push_messages_uuid_delivered` ON `push_messages` (`client_uuid`,`delivered`);--> statement-breakpoint
CREATE INDEX `idx_push_messages_delivered` ON `push_messages` (`delivered`);