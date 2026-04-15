-- 1. Create collection_reports table
CREATE TABLE IF NOT EXISTS collection_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collector_id TEXT NOT NULL,
  machine_id INTEGER,
  device_no TEXT NOT NULL,
  machine_name TEXT,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  initial_weight NUMERIC(10, 2) DEFAULT 0,
  final_weight NUMERIC(10, 2) DEFAULT 0,
  status TEXT DEFAULT 'In Progress',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add bin_weight_snapshot to machines
ALTER TABLE machines ADD COLUMN IF NOT EXISTS bin_weight_snapshot NUMERIC(10, 2) DEFAULT 0;

-- 3. Enable RLS
ALTER TABLE collection_reports ENABLE ROW LEVEL SECURITY;

-- 4. Create index
CREATE INDEX IF NOT EXISTS idx_collection_reports_collector ON collection_reports(collector_id);
CREATE INDEX IF NOT EXISTS idx_collection_reports_machine ON collection_reports(device_no);
CREATE INDEX IF NOT EXISTS idx_collection_reports_start ON collection_reports(start_time DESC);