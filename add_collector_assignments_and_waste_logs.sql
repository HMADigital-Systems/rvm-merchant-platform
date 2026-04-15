-- Add collector assignment column to machines table for Collector-based filtering
ALTER TABLE machines ADD COLUMN IF NOT EXISTS assigned_collector_id UUID REFERENCES app_admins(id);

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_machines_assigned_collector_id ON machines(assigned_collector_id) WHERE assigned_collector_id IS NOT NULL;

-- Create waste_logs table for collector collection records
CREATE TABLE IF NOT EXISTS waste_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id INTEGER NOT NULL REFERENCES machines(id),
  collector_id UUID NOT NULL REFERENCES app_admins(id),
  collector_email VARCHAR NOT NULL,
  pet_weight_kg DECIMAL(10, 2) DEFAULT 0,
  aluminum_weight_kg DECIMAL(10, 2) DEFAULT 0,
  uco_weight_kg DECIMAL(10, 2) DEFAULT 0,
  total_weight_kg DECIMAL(10, 2) GENERATED ALWAYS AS (pet_weight_kg + aluminum_weight_kg + uco_weight_kg) STORED,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance tracking
CREATE INDEX IF NOT EXISTS idx_waste_logs_collector_id ON waste_logs(collector_id);
CREATE INDEX IF NOT EXISTS idx_waste_logs_collected_at ON waste_logs(collected_at);
CREATE INDEX IF NOT EXISTS idx_waste_logs_machine_id ON waste_logs(machine_id);

-- Enable RLS
ALTER TABLE waste_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Collectors can only see their own logs
CREATE POLICY "Collectors can view own waste logs" ON waste_logs
  FOR SELECT USING (auth.uid() = collector_id);

-- RLS Policy: Super Admins can view all logs
CREATE POLICY "Super Admins can view all waste logs" ON waste_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM app_admins WHERE id = auth.uid() AND role = 'SUPER_ADMIN')
  );

-- RLS Policy: Insert policy
CREATE POLICY "Collectors can insert waste logs" ON waste_logs
  FOR INSERT WITH CHECK (auth.uid() = collector_id);

COMMENT ON TABLE waste_logs IS 'Table for storing collector waste collection records with weight data';
COMMENT ON COLUMN waste_logs.pet_weight_kg IS 'PET Plastic weight in kilograms';
COMMENT ON COLUMN waste_logs.aluminum_weight_kg IS 'Aluminum weight in kilograms';
COMMENT ON COLUMN waste_logs.uco_weight_kg IS 'Used Cooking Oil weight in kilograms';