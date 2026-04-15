-- Create realtime_logs table for WebSocket/Socket.io style broadcasting
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS realtime_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB,
  machine_id TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE realtime_logs ENABLE ROW LEVEL SECURITY;

-- Allow public read access for dashboard
CREATE POLICY "Allow public read on realtime_logs" 
ON realtime_logs FOR SELECT 
USING (true);

-- Allow authenticated write
CREATE POLICY "Allow authenticated insert on realtime_logs" 
ON realtime_logs FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_realtime_logs_event_type ON realtime_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_realtime_logs_created_at ON realtime_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_logs_machine_id ON realtime_logs(machine_id);

-- Optional: Enable realtime on this table in Supabase Dashboard
-- Go to Database -> Replication -> Enable realtime for realtime_logs