-- Add page_permissions column to app_admins
ALTER TABLE public.app_admins ADD COLUMN IF NOT EXISTS page_permissions JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.app_admins.page_permissions IS 'Array of page IDs the admin can access, e.g. ["dashboard","submissions","users"]';
