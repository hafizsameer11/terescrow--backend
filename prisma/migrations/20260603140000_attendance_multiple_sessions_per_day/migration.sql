-- Allow multiple clock-in/out sessions per agent per day (re-check-in after checkout).
DROP INDEX `attendance_logs_user_id_date_key` ON `attendance_logs`;
CREATE INDEX `attendance_logs_user_id_date_idx` ON `attendance_logs`(`user_id`, `date`);
