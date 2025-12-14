ALTER TABLE `characters` ADD `appearance` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `audio_paths` text;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `response_style` text DEFAULT 'long';