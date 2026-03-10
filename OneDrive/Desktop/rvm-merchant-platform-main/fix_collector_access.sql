-- Script to check and fix collector access issues
-- Run this in your Supabase SQL Editor

-- 1. First, check all current admins and their roles
SELECT email, role, merchant_id FROM app_admins ORDER BY role, email;

-- 2. Check if the role constraint allows COLLECTOR role
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'app_admins_role_check';

-- 3. If constraint doesn't exist or doesn't include COLLECTOR, fix it:
ALTER TABLE app_admins DROP CONSTRAINT IF EXISTS app_admins_role_check;
ALTER TABLE app_admins ADD CONSTRAINT app_admins_role_check 
CHECK (role IN ('VIEWER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN', 'COLLECTOR', 'AGENT'));

-- 4. To add a COLLECTOR role (replace with your collector's email):
-- INSERT INTO app_admins (email, role, merchant_id) 
-- VALUES ('collector@yourdomain.com', 'COLLECTOR', NULL);

-- 5. To update an existing user to COLLECTOR role:
-- UPDATE app_admins SET role = 'COLLECTOR' WHERE email = 'collector@yourdomain.com';

-- 6. Check current users in the system:
SELECT * FROM app_admins;
