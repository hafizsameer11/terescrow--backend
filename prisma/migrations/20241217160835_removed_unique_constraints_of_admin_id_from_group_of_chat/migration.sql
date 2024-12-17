-- Step 1: Drop the foreign key constraint referencing `adminId`
ALTER TABLE `ChatGroup` DROP FOREIGN KEY `ChatGroup_adminId_fkey`;

-- Step 2: Drop the unique index on `adminId` (if exists)
DROP INDEX `ChatGroup_adminId_key` ON `ChatGroup`;

-- Step 3: Re-add the foreign key constraint (without uniqueness)
ALTER TABLE `ChatGroup`
ADD CONSTRAINT `ChatGroup_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`);
