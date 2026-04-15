-- Add collector name and phone columns to collection_reports
ALTER TABLE collection_reports ADD COLUMN IF NOT EXISTS collector_name TEXT;
ALTER TABLE collection_reports ADD COLUMN IF NOT EXISTS collector_phone TEXT;