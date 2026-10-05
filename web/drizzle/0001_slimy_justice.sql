CREATE TABLE `player_profiles` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`battles` integer DEFAULT 0 NOT NULL,
	`unlocked` text DEFAULT '[]' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_battles` (
	`profile_hash` text NOT NULL,
	`code` text NOT NULL,
	PRIMARY KEY(`profile_hash`, `code`)
);
--> statement-breakpoint
CREATE TABLE `room_players` (
	`code` text NOT NULL,
	`slot` integer NOT NULL,
	`team` integer NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`deck` text NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`seen` integer NOT NULL,
	`offer` text,
	`answer` text,
	`profile_hash` text,
	PRIMARY KEY(`code`, `slot`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_player_tokens` ON `room_players` (`token_hash`);--> statement-breakpoint
CREATE TABLE `team_inputs` (
	`code` text NOT NULL,
	`player_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`payload` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`code`, `player_id`, `seq`)
);
--> statement-breakpoint
CREATE TABLE `team_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`snapshot` text,
	`snapshot_seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `team_rooms_expiry` ON `team_rooms` (`expires`);