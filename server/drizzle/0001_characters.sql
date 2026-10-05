CREATE TABLE `character` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`owner_member_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`public_bio` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `character_room_idx` ON `character` (`room_id`);--> statement-breakpoint
CREATE INDEX `character_owner_idx` ON `character` (`owner_member_id`);--> statement-breakpoint
CREATE TABLE `character_secret` (
	`character_id` text PRIMARY KEY NOT NULL,
	`doc` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade
);
