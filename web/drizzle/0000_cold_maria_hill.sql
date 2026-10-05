CREATE TABLE `inputs` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`seq` integer NOT NULL,
	`payload` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inputs_room_seq` ON `inputs` (`code`,`seq`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`host_hash` text NOT NULL,
	`guest_hash` text,
	`status` text DEFAULT 'waiting' NOT NULL,
	`offer` text,
	`answer` text,
	`host_deck` text NOT NULL,
	`guest_deck` text,
	`host_ready` integer DEFAULT 0 NOT NULL,
	`guest_ready` integer DEFAULT 0 NOT NULL,
	`snapshot` text,
	`snapshot_seq` integer DEFAULT 0 NOT NULL,
	`host_seen` integer NOT NULL,
	`guest_seen` integer
);
--> statement-breakpoint
CREATE INDEX `rooms_expiry` ON `rooms` (`expires`);