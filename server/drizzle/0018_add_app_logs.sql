CREATE TABLE `app_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`source` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_app_logs_level` ON `app_logs` (`level`);
--> statement-breakpoint
CREATE INDEX `idx_app_logs_created` ON `app_logs` (`created_at`);
