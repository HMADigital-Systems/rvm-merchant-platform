-- Migration: Create recycling_activities & collection system
-- Replaces: submission_reviews (-> recycling_activities)
-- Replaces: cleaning_records + collection_requests (-> collection_tasks)
-- New: collectors table

-- ============================================
-- 1. RECYCLING ACTIVITIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.recycling_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  phone TEXT,
  merchant_id UUID NOT NULL,
  device_no TEXT NOT NULL,
  waste_type TEXT NOT NULL,
  weight_kg NUMERIC(10,2) DEFAULT 0,
  points_awarded NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'VERIFIED' CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
  photo_urls TEXT[] DEFAULT '{}',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  is_collected BOOLEAN DEFAULT FALSE,
  collected_at TIMESTAMPTZ,
  collected_by TEXT,
  collector_notes TEXT,
  -- Legacy fields from submission_reviews
  vendor_record_id TEXT,
  api_weight NUMERIC(10,2) DEFAULT 0,
  actual_weight NUMERIC(10,2) DEFAULT 0,
  confirmed_weight NUMERIC(10,2) DEFAULT 0,
  rate_per_kg NUMERIC(10,2) DEFAULT 0,
  calculated_value NUMERIC(10,2) DEFAULT 0,
  machine_given_points NUMERIC(10,2) DEFAULT 0,
  -- Audit
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recycling_user ON public.recycling_activities (user_id);
CREATE INDEX IF NOT EXISTS idx_recycling_device ON public.recycling_activities (device_no);
CREATE INDEX IF NOT EXISTS idx_recycling_type ON public.recycling_activities (waste_type);
CREATE INDEX IF NOT EXISTS idx_recycling_submitted ON public.recycling_activities (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_recycling_status ON public.recycling_activities (status);

-- Enable RLS
ALTER TABLE public.recycling_activities ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. COLLECTORS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.collectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  vehicle_info TEXT,
  assigned_area TEXT,
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','BUSY')),
  total_collections INT DEFAULT 0,
  total_weight_kg NUMERIC(10,2) DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_collectors_status ON public.collectors (status);

ALTER TABLE public.collectors ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. COLLECTION TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.collection_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('RVM','ON_DEMAND')),
  source_ref TEXT,
  collector_id UUID REFERENCES public.collectors(id) ON DELETE SET NULL,
  collector_name TEXT,
  customer_id TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_lat NUMERIC(10,7),
  customer_lng NUMERIC(10,7),
  device_no TEXT,
  waste_type TEXT NOT NULL,
  weight_kg NUMERIC(10,2) DEFAULT 0,
  bag_weight_collected NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED','IN_PROGRESS','COLLECTED','VERIFIED','REJECTED','CANCELLED')),
  priority TEXT DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  photo_urls TEXT[] DEFAULT '{}',
  notes TEXT,
  admin_notes TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  merchant_id UUID NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_collection_collector ON public.collection_tasks (collector_id);
CREATE INDEX IF NOT EXISTS idx_collection_status ON public.collection_tasks (status);
CREATE INDEX IF NOT EXISTS idx_collection_source ON public.collection_tasks (source_type);
CREATE INDEX IF NOT EXISTS idx_collection_assigned ON public.collection_tasks (assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_device ON public.collection_tasks (device_no);

ALTER TABLE public.collection_tasks ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. MIGRATE DATA
-- ============================================

-- Migrate submission_reviews -> recycling_activities
INSERT INTO public.recycling_activities (
  user_id, phone, merchant_id, device_no, waste_type,
  weight_kg, points_awarded, status,
  photo_urls, submitted_at, synced_at,
  is_collected, collected_at, collected_by, collector_notes,
  vendor_record_id, api_weight, actual_weight, confirmed_weight,
  rate_per_kg, calculated_value, machine_given_points,
  reviewed_by, reviewed_at, notes
)
SELECT 
  COALESCE(user_id, 'unknown'),
  phone,
  COALESCE(merchant_id, '11111111-1111-1111-1111-111111111111'::uuid),
  device_no,
  waste_type,
  COALESCE(total_weight, 0),
  COALESCE(points_awarded, 0),
  COALESCE(status, 'VERIFIED'),
  CASE WHEN photo_url IS NOT NULL AND photo_url != '' 
       THEN string_to_array(photo_url, ',') 
       ELSE '{}' 
  END,
  submitted_at,
  created_at,
  COALESCE(is_delivered, FALSE),
  delivered_at,
  delivered_by,
  collector_name,
  vendor_record_id,
  COALESCE(api_weight, 0),
  COALESCE(actual_weight, 0),
  COALESCE(confirmed_weight, 0),
  COALESCE(rate_per_kg, 0),
  COALESCE(calculated_value, 0),
  COALESCE(machine_given_points, 0),
  reviewed_by,
  reviewed_at,
  notes
FROM public.submission_reviews
ON CONFLICT DO NOTHING;

-- Seed known collectors
INSERT INTO public.collectors (name, phone, status)
VALUES ('Ismail KDEB', NULL, 'ACTIVE')
ON CONFLICT DO NOTHING;

-- Migrate cleaning_records -> collection_tasks (RVM type)
INSERT INTO public.collection_tasks (
  source_type, source_ref,
  collector_id, collector_name,
  device_no, waste_type, weight_kg, bag_weight_collected,
  status, photo_urls, admin_notes,
  collected_at, verified_at,
  merchant_id
)
SELECT 
  'RVM',
  cr.id::text,
  col.id,
  cr.cleaner_name,
  cr.device_no,
  cr.waste_type,
  0,
  cr.bag_weight_collected,
  CASE WHEN cr.status = 'VERIFIED' THEN 'VERIFIED' ELSE 'COLLECTED' END,
  CASE WHEN cr.photo_url IS NOT NULL AND cr.photo_url != '' 
       THEN ARRAY[cr.photo_url] ELSE '{}' 
  END,
  cr.admin_note,
  cr.cleaned_at,
  CASE WHEN cr.status = 'VERIFIED' THEN cr.cleaned_at ELSE NULL END,
  COALESCE(cr.merchant_id, '11111111-1111-1111-1111-111111111111'::uuid)
FROM public.cleaning_records cr
LEFT JOIN public.collectors col ON col.name = cr.cleaner_name;

-- Link collection_tasks collector_name -> collector_id (fallback)
UPDATE public.collection_tasks t
SET collector_id = c.id,
    collector_name = c.name
FROM public.collectors c
WHERE t.collector_name = c.name
  AND t.collector_id IS NULL;

-- ============================================
-- 5. CREATE VIEW FOR BACKWARD COMPAT
-- ============================================

-- Keep old tables for backward compat (don't delete)
-- Views that merge old + new data
CREATE OR REPLACE VIEW public.disposal_logs AS
SELECT 
  id::text AS log_id,
  device_no,
  waste_type,
  bag_weight_collected AS weight,
  cleaned_at AS event_time,
  cleaner_name AS operator,
  status,
  photo_url AS photo,
  'CLEANING' AS source
FROM public.cleaning_records
UNION ALL
SELECT 
  id::text,
  device_no,
  waste_type,
  weight_kg,
  submitted_at,
  COALESCE(phone, 'User'),
  status,
  array_to_string(photo_urls, ','),
  'RECYCLING' AS source
FROM public.recycling_activities
ORDER BY event_time DESC;

-- ============================================
-- 6. RLS POLICIES (basic)
-- ============================================

-- Allow service_role full access
CREATE POLICY service_access ON public.recycling_activities
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY service_access ON public.collectors
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY service_access ON public.collection_tasks
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 7. DONE
-- ============================================
SELECT 'Migration complete' AS status;
