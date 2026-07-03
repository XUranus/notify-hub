CREATE TABLE `push_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`uuid` text NOT NULL,
	`name` text,
	`os` text NOT NULL,
	`arch` text,
	`app_version` text,
	`last_seen_at` integer,
	`registered_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_clients_uuid_unique` ON `push_clients` (`uuid`);--> statement-breakpoint
CREATE TABLE `push_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`client_uuid` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`delivered` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
