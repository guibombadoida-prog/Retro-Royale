CREATE TABLE `account_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_sessions_expiry` ON `account_sessions` (`expires`);--> statement-breakpoint
CREATE TABLE `email_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`profile_hash` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_email` ON `email_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `email_login_codes` (
	`challenge_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`guest_hash` text NOT NULL,
	`source_hash` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'sending' NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_codes_email_created` ON `email_login_codes` (`email`,`created`);--> statement-breakpoint
CREATE INDEX `login_codes_guest_created` ON `email_login_codes` (`guest_hash`,`created`);--> statement-breakpoint
CREATE INDEX `login_codes_source_created` ON `email_login_codes` (`source_hash`,`created`);--> statement-breakpoint
CREATE INDEX `login_codes_expiry` ON `email_login_codes` (`expires`);--> statement-breakpoint
ALTER TABLE `player_profiles` ADD `deck` text;--> statement-breakpoint
ALTER TABLE `player_profiles` ADD `settings` text;--> statement-breakpoint
ALTER TABLE `player_profiles` ADD `revision` integer DEFAULT 0 NOT NULL;