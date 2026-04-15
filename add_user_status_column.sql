-- =============================================
-- Add status column to users table for fraud detection
-- Run in Supabase SQL Editor
-- =============================================

-- Add status column if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';

-- Update existing users with null status to ACTIVE
UPDATE users SET status = 'ACTIVE' WHERE status IS NULL;

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status) WHERE status = 'UNDER_REVIEW';

-- Verify column
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'status';