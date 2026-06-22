CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(512) NOT NULL,
	`type` varchar(64) NOT NULL,
	`thumbnailUrl` text,
	`pdfUrl` text NOT NULL,
	`pdfKey` varchar(512),
	`culturalVariant` varchar(128),
	`ageRange` varchar(32),
	`theme` varchar(128),
	`pageCount` int,
	`options` json,
	`listingStatus` json DEFAULT ('{}'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
