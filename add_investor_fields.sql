-- Add Investor fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT;

-- Add Investor fields to machines table
ALTER TABLE machines ADD COLUMN IF NOT EXISTS investor_id UUID REFERENCES users(id);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS investment_value NUMERIC;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS contract_start_date DATE;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS contract_end_date DATE;