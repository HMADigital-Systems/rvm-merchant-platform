-- ============================================================================
-- Agent Machine Assignment Script
-- Run this in Supabase SQL Editor to assign machines to an agent
-- ============================================================================

-- UPDATE THIS: Replace with the agent's email address
DO $$
DECLARE
    agent_email TEXT := 'YOUR_AGENT_EMAIL_HERE@domain.com';  -- CHANGE THIS
    admin_uuid UUID;
BEGIN
    -- Step 1: Get the admin UUID for the agent
    SELECT id INTO admin_uuid 
    FROM app_admins 
    WHERE email = agent_email AND role = 'AGENT';

    IF admin_uuid IS NULL THEN
        RAISE NOTICE 'Agent not found with email: %', agent_email;
        RETURN;
    END IF;

    RAISE NOTICE 'Found agent admin UUID: %', admin_uuid;

    -- Step 2: Get machine IDs for the devices
    -- This will show you the machine IDs - run separately to verify
    -- SELECT id, device_no, name FROM machines WHERE device_no IN ('071582000003', '071582000006');

    -- Step 3: Insert assignments (run after verifying machine IDs)
    -- Replace MACHINE_ID_1 and MACHINE_ID_2 with actual IDs from Step 2
    
    -- Example for device 071582000003 (replace MACHINE_ID_1 with actual ID):
    -- INSERT INTO viewer_machine_assignments (admin_id, machine_id) 
    -- VALUES (admin_uuid, MACHINE_ID_1)
    -- ON CONFLICT (admin_id, machine_id) DO NOTHING;

END $$;

-- ============================================================================
-- SIMPLIFIED VERSION: Run this after replacing the values
-- ============================================================================

-- Step 1: Find machine IDs
SELECT id, device_no, name, merchant_id 
FROM machines 
WHERE device_no IN ('071582000003', '071582000006');

-- Step 2: Find your admin ID (replace with your email)
SELECT id, email, role, merchant_id 
FROM app_admins 
WHERE email = 'YOUR_EMAIL@here.com';

-- Step 3: Assign machines (run after getting IDs from above)
-- Replace 'YOUR_ADMIN_ID' with the UUID from Step 2
-- Replace MACHINE_ID_1 and MACHINE_ID_2 with IDs from Step 1
/*
INSERT INTO viewer_machine_assignments (admin_id, machine_id) 
VALUES 
    ('YOUR_ADMIN_ID-uuid-here', MACHINE_ID_1),
    ('YOUR_ADMIN_ID-uuid-here', MACHINE_ID_2)
ON CONFLICT (admin_id, machine_id) DO NOTHING;
*/
