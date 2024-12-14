/*
  Warnings:

  - The values [non_binary,prefer_not_to_say] on the enum `User_gender` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `user` MODIFY `gender` ENUM('male', 'female', 'other') NOT NULL;
