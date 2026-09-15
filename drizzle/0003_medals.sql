ALTER TABLE `alliances` ADD `gold` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `alliances` ADD `silver` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `alliances` ADD `bronze` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `alliances` SET `gold` = (SELECT COUNT(*) FROM `results` WHERE `results`.`gold` = `alliances`.`id`);
--> statement-breakpoint
UPDATE `alliances` SET `silver` = (SELECT COUNT(*) FROM `results` WHERE `results`.`silver` = `alliances`.`id`);
--> statement-breakpoint
UPDATE `alliances` SET `bronze` = (SELECT COUNT(*) FROM `results` WHERE `results`.`bronze` = `alliances`.`id`);
