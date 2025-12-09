CREATE TABLE `character_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`character_id` integer NOT NULL,
	`file_path` text NOT NULL,
	`prompt_id` text,
	`is_default` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `characters` ADD `voice_sample` text;--> statement-breakpoint
ALTER TABLE `characters` ADD `voice_sample_text` text;--> statement-breakpoint
ALTER TABLE `characters` ADD `voice_speed` real DEFAULT 1;--> statement-breakpoint
ALTER TABLE `lorebook_entries` ADD `weight` integer DEFAULT 5;--> statement-breakpoint
ALTER TABLE `lorebook_entries` ADD `is_always_included` integer DEFAULT false;