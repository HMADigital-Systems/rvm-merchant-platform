CREATE TABLE IF NOT EXISTS viewer_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  machine_id INTEGER,
  machine_name TEXT,
  issue_type TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
