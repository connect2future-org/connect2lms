ALTER TABLE `attempts` ADD `activeAttemptKey` varchar(80);--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_active_attempt_unique` UNIQUE(`activeAttemptKey`);