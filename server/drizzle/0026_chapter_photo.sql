CREATE TABLE `chapter_photo` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`image_file` text,
	`image_w` integer,
	`image_h` integer,
	`image_bytes` integer,
	`image_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapter`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chapter_photo_chapter_idx` ON `chapter_photo` (`chapter_id`,`sort`);