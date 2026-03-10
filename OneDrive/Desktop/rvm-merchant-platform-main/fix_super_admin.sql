-- First, let's check your current role
-- Replace 'your-email@example.com' with your actual email
SELECT email, role, merchant_id FROM app_admins WHERE email = 'your-email@example.com';

-- If your role is not 'SUPER_ADMIN', update it:
-- UPDATE app_admins SET role = 'SUPER_ADMIN' WHERE email = 'your-email@example.com';

-- Also make sure the role check constraint allows all roles including ADMIN
-- Drop and recreate the constraint with all roles
ALTER TABLE app_admins DROP CONSTRAINT IF EXISTS app_admins_role_check;
ALTER TABLE app_admins ADD CONSTRAINT app_admins_role_check 
CHECK (role IN ('VIEWER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN', 'COLLECTOR', 'AGENT'));

-- Verify constraint is correct
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'app_admins_role_check';
