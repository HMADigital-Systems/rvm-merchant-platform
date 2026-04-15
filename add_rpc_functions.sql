-- =============================================
-- Add RPC functions for investor login
-- Run in Supabase SQL Editor
-- =============================================

-- Function to get admin role (bypasses RLS)
CREATE OR REPLACE FUNCTION get_admin_role(check_email TEXT)
RETURNS TABLE(role TEXT, merchant_id TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT a.role, a.merchant_id::TEXT
  FROM app_admins a
  WHERE a.email = check_email;
END;
$$;

-- Function to check admin whitelist (bypasses RLS)
CREATE OR REPLACE FUNCTION check_admin_whitelist(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_whitelist w WHERE w.email = check_email
  );
END;
$$;

-- Verify the investor is in the table
SELECT email, role, merchant_id FROM app_admins WHERE role = 'INVESTOR';