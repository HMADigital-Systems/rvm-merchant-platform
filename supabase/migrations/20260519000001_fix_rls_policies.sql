-- Fix RLS policies for new tables to allow authenticated users

-- ============================================
-- recycling_activities
-- ============================================

-- Drop old service_access policy
DROP POLICY IF EXISTS service_access ON public.recycling_activities;

-- Allow all authenticated users to read
CREATE POLICY "enable_read_for_authenticated" ON public.recycling_activities
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Allow service_role full access
CREATE POLICY "enable_all_for_service" ON public.recycling_activities
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- collection_tasks
-- ============================================

DROP POLICY IF EXISTS service_access ON public.collection_tasks;

CREATE POLICY "enable_read_for_authenticated" ON public.collection_tasks
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "enable_all_for_service" ON public.collection_tasks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- collectors
-- ============================================

DROP POLICY IF EXISTS service_access ON public.collectors;

CREATE POLICY "enable_read_for_authenticated" ON public.collectors
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "enable_all_for_service" ON public.collectors
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

SELECT 'RLS policies updated' AS status;
