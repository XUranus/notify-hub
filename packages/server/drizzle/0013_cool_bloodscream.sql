CREATE TABLE `cleanup_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`duration_ms` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`expired_attachments` integer DEFAULT 0 NOT NULL,
	`expired_messages` integer DEFAULT 0 NOT NULL,
	`trimmed_messages` integer DEFAULT 0 NOT NULL,
	`error` text
);
