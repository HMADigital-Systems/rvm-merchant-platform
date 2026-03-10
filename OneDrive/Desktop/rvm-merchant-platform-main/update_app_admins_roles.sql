-- Update the check constraint on app_admins table to allow COLLECTOR and AGENT roles
-- This script drops the existing constraint and creates a new one with all allowed roles

-- First, drop the existing check constraint
ALTER TABLE app_admins DROP CONSTRAINT IF EXISTS app_admins_role_check;

-- Create new check constraint with all 6 roles
ALTER TABLE app_admins ADD CONSTRAINT app_admins_role_check 
CHECK (role IN ('VIEWER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN', 'COLLECTOR', 'AGENT'));

-- To assign machines to a Collector or Agent, you need to:
-- 1. Find the admin_id from app_admins table for the Collector/Agent
-- 2. Find the machine_ids for Idaman Bukit Jelutong from machines table
-- 3. Insert into viewer_machine_assignments table

-- Example: Assign machines to a Collector/Agent (run this separately for each user)
-- INSERT INTO viewer_machine_assignments (admin_id, machine_id, assigned_by)
-- SELECT 
--   (SELECT id FROM app_admins WHERE email = 'collector@email.com'),
--   id,
--   (SELECT id FROM app_admins WHERE email = 'superadmin@email.com')
-- FROM machines 
-- WHERE merchant_id = (SELECT id FROM merchants WHERE name ILIKE '%Idaman Bukit Jelutong%');

-- Verify the constraint was updated
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conname = 'app_admins_role_check';
