CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`code` text NOT NULL,
	`description` text NOT NULL,
	`quantity_milli` integer NOT NULL,
	`unit_cents` integer NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`clinic`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clinic_product_code` ON `products` (`clinic`,`code`);