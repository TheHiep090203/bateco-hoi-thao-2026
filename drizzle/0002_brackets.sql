CREATE TABLE `brackets` (
	`sport_id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`sport_id`) REFERENCES `sports`(`id`) ON UPDATE no action ON DELETE no action
);
