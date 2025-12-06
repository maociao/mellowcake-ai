CREATE TABLE `lorebook_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lorebook_id` integer NOT NULL,
	`label` text,
	`content` text NOT NULL,
	`keywords` text,
	`enabled` integer DEFAULT true,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`lorebook_id`) REFERENCES `lorebooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `characters` ADD `lorebooks` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `name` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `swipes` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `current_index` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `lorebooks` text;--> statement-breakpoint
ALTER TABLE `personas` ADD `character_id` integer REFERENCES characters(id);