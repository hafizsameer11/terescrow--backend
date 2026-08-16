-- Busha crypto KYC applications + customer identity fields
ALTER TABLE `busha_customers`
  ADD COLUMN `birth_date` VARCHAR(20) NULL AFTER `country_id`,
  ADD COLUMN `nin` VARCHAR(20) NULL AFTER `birth_date`;

ALTER TABLE `busha_kyc_applications`
  ADD COLUMN `id_document_path` VARCHAR(255) NULL AFTER `selfie_path`,
  ADD COLUMN `source` VARCHAR(30) NOT NULL DEFAULT 'terescrow_kyc' AFTER `id_document_path`,
  ADD COLUMN `terescrow_kyc_id` INT NULL AFTER `source`;
