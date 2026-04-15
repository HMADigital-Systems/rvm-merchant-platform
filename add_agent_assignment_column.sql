-- Add assigned_agent_id column to machines table for Agent-based filtering
ALTER TABLE machines ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES app_admins(id);

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_machines_assigned_agent_id ON machines(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;

-- Grant necessary permissions (adjust as needed for your RLS policy)
-- This ensures agents can only see machines assigned to them