CREATE TABLE `account_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_sessions_expiry` ON `account_sessions` (`expires`);--> statement-breakpoint
CREATE TABLE `google_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`profile_hash` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_account_subject` ON `google_accounts` (`google_sub`);--> statement-breakpoint
CREATE TABLE `google_login_flows` (
	`flow_hash` text PRIMARY KEY NOT NULL,
	`poll_hash` text NOT NULL,
	`guest_hash` text NOT NULL,
	`state_hash` text,
	`nonce` text,
	`verifier` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`account_id` text,
	`created` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `google_login_flows_expiry` ON `google_login_flows` (`expires`);--> statement-breakpoint
CREATE UNIQUE INDEX `google_flow_state` ON `google_login_flows` (`state_hash`);--> statement-breakpoint
ALTER TABLE `player_profiles` ADD `deck` text;--> statement-breakpoint
ALTER TABLE `player_profiles` ADD `settings` text;--> statement-breakpoint
ALTER TABLE `player_profiles` ADD `revision` integer DEFAULT 0 NOT NULL;