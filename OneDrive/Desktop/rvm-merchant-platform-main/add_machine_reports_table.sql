-- ============================================================================
-- Machine Reports Table
-- This table stores machine issue reports created by agents
-- Critical Alerts will be shown to both Super Admin and the reporting Agent
-- ============================================================================

-- Create the machine_reports table
CREATE TABLE IF NOT EXISTS machine_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    device_no VARCHAR(50) NOT NULL,
    merchant_id UUID REFERENCES app_admins(id) ON DELETE SET NULL,
    
    -- Report details
    report_type VARCHAR(50) NOT NULL, -- 'MAINTENANCE', 'BIN_FULL', 'PRINTER_JAM', 'NETWORK_ISSUE', 'OTHER'
    severity VARCHAR(20) NOT NULL DEFAULT 'critical', -- 'critical', 'warning', 'info'
    description TEXT NOT NULL,
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'
    
    -- Who reported and who is handling
    reported_by_admin_id UUID REFERENCES app_admins(id) ON DELETE SET NULL,
    reported_by_name VARCHAR(255),
    assigned_to_admin_id UUID REFERENCES app_admins(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_machine_reports_machine_id ON machine_reports(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_reports_status ON machine_reports(status);
CREATE INDEX IF NOT EXISTS idx_machine_reports_created_at ON machine_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_machine_reports_reported_by ON machine_reports(reported_by_admin_id);
CREATE INDEX IF NOT EXISTS idx_machine_reports_merchant_id ON machine_reports(merchant_id);

-- Enable Row Level Security
ALTER TABLE machine_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read reports
CREATE POLICY "Anyone can read machine reports" 
ON machine_reports FOR SELECT 
USING (true);

-- Policy: Authenticated users can insert reports
CREATE POLICY "Authenticated users can insert machine reports" 
ON machine_reports FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Policy: Admins can update reports
CREATE POLICY "Admins can update machine reports" 
ON machine_reports FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM app_admins 
        WHERE id = auth.uid()
    )
);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_machine_reports_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_machine_reports_timestamp
    BEFORE UPDATE ON machine_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_machine_reports_timestamp();

-- ============================================================================
-- Example queries:
-- ============================================================================

-- Get all pending critical reports (for Super Admin)
-- SELECT mr.*, m.name as machine_name, m.address 
-- FROM machine_reports mr
-- LEFT JOIN machines m ON mr.machine_id = m.id
-- WHERE mr.status = 'PENDING' AND mr.severity = 'critical'
-- ORDER BY mr.created_at DESC;

-- Get reports by a specific agent
-- SELECT * FROM machine_reports 
-- WHERE reported_by_admin_id = 'admin-uuid-here'
-- ORDER BY created_at DESC;

-- Get reports for a specific merchant
-- SELECT mr.*, m.name as machine_name 
-- FROM machine_reports mr
-- LEFT JOIN machines m ON mr.machine_id = m.id
-- WHERE mr.merchant_id = 'merchant-admin-uuid-here'
-- ORDER BY mr.created_at DESC;
