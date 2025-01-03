/*
  Warnings:

  - You are about to alter the column `cryptoBuyLimit` on the `kyclimits` table. The data in that column could be lost. The data in that column will be cast from `Double` to `VarChar(191)`.
  - You are about to alter the column `cryptoSellLimit` on the `kyclimits` table. The data in that column could be lost. The data in that column will be cast from `Double` to `VarChar(191)`.
  - You are about to alter the column `giftCardBuyLimit` on the `kyclimits` table. The data in that column could be lost. The data in that column will be cast from `Double` to `VarChar(191)`.
  - You are about to alter the column `giftCardSellLimit` on the `kyclimits` table. The data in that column could be lost. The data in that column will be cast from `Double` to `VarChar(191)`.

*/
-- AlterTable
ALTER TABLE `kyclimits` MODIFY `cryptoBuyLimit` VARCHAR(191) NULL,
    MODIFY `cryptoSellLimit` VARCHAR(191) NULL,
    MODIFY `giftCardBuyLimit` VARCHAR(191) NULL,
    MODIFY `giftCardSellLimit` VARCHAR(191) NULL;
