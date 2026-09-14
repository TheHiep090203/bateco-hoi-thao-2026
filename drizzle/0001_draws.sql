CREATE TABLE `draws` (
	`id` text PRIMARY KEY NOT NULL,
	`sport_id` integer NOT NULL,
	`ord` integer NOT NULL,
	`c1` text DEFAULT '' NOT NULL,
	`c2` text DEFAULT '' NOT NULL,
	`c3` text DEFAULT '' NOT NULL,
	`c4` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`sport_id`) REFERENCES `sports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `draws_sport_ord` ON `draws` (`sport_id`,`ord`);
--> statement-breakpoint
DROP TABLE IF EXISTS `admins`;
