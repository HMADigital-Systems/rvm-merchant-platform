-- ============================================================================
-- Assign Idaman Bukit Jelutong Machines to Agent
-- Run this in Supabase SQL Editor - Step by Step
-- ============================================================================

-- ============================================================================
-- STEP 1: Find machines at Idaman Bukit Jelutong
-- Copy the IDs from the result
-- ============================================================================
SELECT id, device_no, name, address, zone, merchant_id 
FROM machines 
WHERE name ILIKE '%Idaman%' 
  AND (name ILIKE '%Bukit Jelutong%' OR address ILIKE '%Bukit Jelutong%')
  AND is_active = true;

-- ============================================================================
-- STEP 2: Find the agent by email
-- Replace 'agent@email.com' with the actual agent email
-- ============================================================================
SELECT id, email, role, merchant_id 
FROM app_admins 
WHERE email = 'agent@email.com' 
  AND role = 'AGENT';

-- ============================================================================
-- STEP 3: The actual assignment (run AFTER getting IDs from Steps 1 & 2)
-- Replace the values below:
--   - 'AGENT_ADMIN_UUID' = ID from Step 2
--   - MACHINE_ID_1, MACHINE_ID_2 = IDs from Step 1
-- ============================================================================
/*
INSERT INTO viewer_machine_assignments (admin_id, machine_id, assigned_by)
SELECT 
    'AGENT_ADMIN_UUID',
    id,
    (SELECT id FROM app_admins WHERE role = 'SUPER_ADMIN' LIMIT 1)
FROM machines 
WHERE name ILIKE '%Idaman%' 
  AND (name ILIKE '%Bukit Jelutong%' OR address ILIKE '%Bukit Jelutong%')
  AND is_active = true
ON CONFLICT (admin_id, machine_id) DO NOTHING;
*/

-- ============================================================================
-- AUTO-ASSIGNMENT: Run this if you know the agent email
-- This will automatically find machines and assign them
-- ============================================================================
DO $
DECLARE
    agent_email TEXT := 'agent@email.com';  -- CHANGE THIS to agent's email
    agent_uuid UUID;
    super_admin_uuid UUID;
    machines_assigned INTEGER;
BEGIN
    -- Get agent admin ID
    SELECT id INTO agent_uuid 
    FROM app_admins 
    WHERE email = agent_email AND role = 'AGENT';
    
    IF agent_uuid IS NULL THEN
        RAISE NOTICE 'Agent not found with email: %', agent_email;
        RETURN;
    END IF;
    
    -- Get super admin for assigned_by
    SELECT id INTO super_admin_uuid 
    FROM app_admins 
    WHERE role = 'SUPER_ADMIN' LIMIT 1;
    
    -- Insert assignments
    INSERT INTO viewer_machine_assignments (admin_id, machine_id, assigned_by)
    SELECT 
        agent_uuid,
        id,
        super_admin_uuid
    FROM machines 
    WHERE name ILIKE '%Idaman%' 
      AND (name ILIKE '%Bukit Jelutong%' OR address ILIKE '%Bukit Jelutong%')
      AND is_active = true
    ON CONFLICT (admin_id, machine_id) DO NOTHING;
    
    -- Count assignments
    GET DIAGNOSTICS machines_assigned = ROW_COUNT;
    
    RAISE NOTICE 'Assigned % machines to agent: %', machines_assigned, agent_email;
END $;

-- ============================================================================
-- STEP 4: Verify assignments
-- ============================================================================
SELECT 
    vma.id,
    vma.admin_id,
    vma.machine_id,
    vma.assigned_at,
    m.name as machine_name,
    m.device_no,
    m.address,
    a.email as agent_email
FROM viewer_machine_assignments vma
JOIN machines m ON m.id = vma.machine_id
JOIN app_admins a ON a.id = vma.admin_id
WHERE a.role = 'AGENT'
ORDER BY vma.assigned_at DESC
LIMIT 20;
