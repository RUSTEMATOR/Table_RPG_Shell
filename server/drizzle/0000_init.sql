CREATE TABLE `auth_session` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_session_member_idx` ON `auth_session` (`member_id`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`secret_hash` text,
	`invite_token_hash` text,
	`invite_expires_at` integer,
	`invite_used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_invite_token_hash_unique` ON `member` (`invite_token_hash`);--> statement-breakpoint
CREATE INDEX `member_room_idx` ON `member` (`room_id`);--> statement-breakpoint
CREATE TABLE `room` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_code_unique` ON `room` (`code`);