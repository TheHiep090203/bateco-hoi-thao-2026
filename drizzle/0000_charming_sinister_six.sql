CREATE TABLE `admins` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admins_slot_unique` ON `admins` (`slot`);--> statement-breakpoint
CREATE TABLE `alliances` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`members` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `results` (
	`id` text PRIMARY KEY NOT NULL,
	`sport_id` integer NOT NULL,
	`event` text NOT NULL,
	`participants` text NOT NULL,
	`score` text NOT NULL,
	`gold` integer,
	`silver` integer,
	`bronze` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`sport_id`) REFERENCES `sports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gold`) REFERENCES `alliances`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`silver`) REFERENCES `alliances`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bronze`) REFERENCES `alliances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `results_sport_event` ON `results` (`sport_id`,`event`);--> statement-breakpoint
CREATE TABLE `sports` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`discipline` text NOT NULL
);
