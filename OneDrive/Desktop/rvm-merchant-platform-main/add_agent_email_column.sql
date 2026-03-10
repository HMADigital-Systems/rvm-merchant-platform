-- Add assigned_agent_email column to machines table
-- This allows agents to be assigned to specific machines by email

ALTER TABLE machines 
ADD COLUMN IF NOT EXISTS assigned_agent_email TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_machines_assigned_agent_email 
ON machines(assigned_agent_email) 
WHERE assigned_agent_email IS NOT NULL;

-- Example: Assign machines to an agent by updating their assigned_agent_email
-- UPDATE machines 
-- SET assigned_agent_email = 'agent@email.com'
-- WHERE name ILIKE '%Idaman Bukit Jelutong%';

-- Example: Assign all machines from a specific merchant to an agent
-- UPDATE machines 
-- SET assigned_agent_email = 'agent@email.com'
-- WHERE merchant_id = (SELECT id FROM merchants WHERE name ILIKE '%Idaman Bukit Jelutong%');
