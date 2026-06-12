-- Global operation kill-switches (PalmPay withdraw, crypto outside send)
CREATE TABLE `platform_operation_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `palmpay_withdraw_disabled` BOOLEAN NOT NULL DEFAULT false,
    `crypto_outside_send_disabled` BOOLEAN NOT NULL DEFAULT false,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `platform_operation_settings` (`palmpay_withdraw_disabled`, `crypto_outside_send_disabled`, `updated_at`)
VALUES (false, false, CURRENT_TIMESTAMP(3));
