-- Add processing status for trade chats (agent actively handling)
ALTER TYPE "ChatStatus" ADD VALUE IF NOT EXISTS 'processing';
