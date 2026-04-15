-- =============================================
-- Add fraud detection fields to submission_reviews
-- Run in Supabase SQL Editor
-- =============================================

-- Add is_suspicious column
ALTER TABLE submission_reviews ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN DEFAULT false;

-- Add fraud_reason column
ALTER TABLE submission_reviews ADD COLUMN IF NOT EXISTS fraud_reason TEXT;

-- Add status column with new enum values (if not exists)
-- First check if status column already exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'submission_reviews' AND column_name = 'status'
    ) THEN
        ALTER TABLE submission_reviews ADD COLUMN status TEXT DEFAULT 'Pending';
    END IF;
END $$;

-- Update existing records to have 'Approved' status where status was 'VERIFIED'
UPDATE submission_reviews 
SET status = 'Approved' 
WHERE status = 'VERIFIED';

-- Update existing records to have 'Pending' status where status was 'PENDING'
UPDATE submission_reviews 
SET status = 'Pending' 
WHERE status = 'PENDING';

-- Create index for fraud detection queries
CREATE INDEX IF NOT EXISTS idx_submission_reviews_is_suspicious ON submission_reviews(is_suspicious) WHERE is_suspicious = true;
CREATE INDEX IF NOT EXISTS idx_submission_reviews_fraud_reason ON submission_reviews(fraud_reason) WHERE fraud_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submission_reviews_user_date ON submission_reviews(user_id, submitted_at);

-- Verify columns added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'submission_reviews' 
AND column_name IN ('is_suspicious', 'fraud_reason', 'status');