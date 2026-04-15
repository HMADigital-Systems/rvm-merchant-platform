/**
 * Seed script to insert environmental impact data into submission_reviews
 * 
 * This script inserts VERIFIED submission records that will be picked up
 * by the Dashboard's environmental impact calculation.
 * 
 * Data: 594kg total (386kg PET, 208kg Aluminum)
 * Date range: Feb 27 - March 31, 2026
 * 
 * Run: npx tsx scripts/seed-environmental-impact.ts
 * 
 * Note: If you get RLS errors, either:
 * 1. Add SUPABASE_SERVICE_ROLE_KEY to .env file
 * 2. Run the SQL output in Supabase Dashboard SQL Editor
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://piwthttkmkndflmqvxov.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3RodHRrbWtuZGZsbXF2eG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNDE5NDgsImV4cCI6MjA4MjYxNzk0OH0.9h2Rcucs4daQyaqXZx_RKuUCvfpHK5E0QcvX6hTpK-w';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Use service key if available to bypass RLS
const supabase = createClient(SUPABASE_URL, SERVICE_KEY || SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Configuration
const TOTAL_WEIGHT = 594; // kg
const PET_WEIGHT = 386; // kg
const ALUMINUM_WEIGHT = 208; // kg

// Date range: Feb 27 to March 31, 2026
const START_DATE = '2026-02-27';
const END_DATE = '2026-03-31';

// Calculate number of days
const startDate = new Date(START_DATE);
const endDate = new Date(END_DATE);
const dayDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

console.log(`Seeding environmental impact data:`);
console.log(`- Total: ${TOTAL_WEIGHT}kg (${PET_WEIGHT}kg PET, ${ALUMINUM_WEIGHT}kg Aluminum)`);
console.log(`- Date range: ${START_DATE} to ${END_DATE} (${dayDiff} days)`);

async function getMachineId(): Promise<string> {
  // Try to find "Idaman Bukit Jelutong" machine
  const { data: machines, error } = await supabase
    .from('machines')
    .select('device_no, name')
    .ilike('name', '%idaman%')
    .ilike('name', '%bukit%')
    .limit(1);

  if (error) {
    console.error('Error finding machine:', error);
    throw error;
  }

  if (machines && machines.length > 0) {
    console.log(`Found machine: ${machines[0].name} (${machines[0].device_no})`);
    return machines[0].device_no;
  }

  // Fallback: get any machine
  const { data: anyMachine } = await supabase
    .from('machines')
    .select('device_no')
    .limit(1)
    .single();

  if (anyMachine) {
    console.log(`Using fallback machine: ${anyMachine.device_no}`);
    return anyMachine.device_no;
  }

  throw new Error('No machines found in database');
}

async function getMerchantId(deviceNo: string): Promise<string | null> {
  const { data: machine, error } = await supabase
    .from('machines')
    .select('merchant_id')
    .eq('device_no', deviceNo)
    .single();

  if (error) {
    console.warn('Could not get merchant_id:', error);
    return null;
  }

  return machine?.merchant_id || null;
}

async function seedData() {
  try {
    const deviceNo = await getMachineId();
    const merchantId = await getMerchantId(deviceNo);

    // Get a user to attribute submissions to
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    const userId = users?.[0]?.id || '00000000-0000-0000-0000-000000000001';

    // Distribute weight across days
    const dailyPetWeight = PET_WEIGHT / dayDiff;
    const dailyAluminumWeight = ALUMINUM_WEIGHT / dayDiff;

    const records = [];
    const currentDate = new Date(startDate);

    // Rate per kg (approximate)
    const petRate = 1.0;
    const aluminumRate = 3.0;

    for (let i = 0; i < dayDiff; i++) {
      const dateStr = currentDate.toISOString();
      const dailyPet = Math.round(dailyPetWeight * 10) / 10;
      const dailyAlum = Math.round(dailyAluminumWeight * 10) / 10;
      
      // Generate unique vendor_record_id
      const petRecordId = `SEED-PET-${START_DATE.replace(/-/g, '')}-${i.toString().padStart(3, '0')}`;
      const alumRecordId = `SEED-ALU-${START_DATE.replace(/-/g, '')}-${i.toString().padStart(3, '0')}`;
      
      // Add PET record (minimal fields)
      records.push({
        vendor_record_id: petRecordId,
        device_no: deviceNo,
        user_id: userId,
        merchant_id: merchantId,
        waste_type: 'PET Plastic',
        api_weight: dailyPet,
        calculated_value: Math.round(dailyPet * petRate * 100) / 100,
        rate_per_kg: petRate,
        status: 'VERIFIED',
        source: 'SEED',
        submitted_at: dateStr
      });

      // Add Aluminum record (minimal fields)
      records.push({
        vendor_record_id: alumRecordId,
        device_no: deviceNo,
        user_id: userId,
        merchant_id: merchantId,
        waste_type: 'Aluminum',
        api_weight: dailyAlum,
        calculated_value: Math.round(dailyAlum * aluminumRate * 100) / 100,
        rate_per_kg: aluminumRate,
        status: 'VERIFIED',
        source: 'SEED',
        submitted_at: dateStr
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`Inserting ${records.length} records into submission_reviews...`);

    // Try inserting - if RLS fails, generate SQL for manual insertion
    const { data, error } = await supabase
      .from('submission_reviews')
      .insert(records)
      .select();

    if (error) {
      if (error.code === '42501') {
        console.log('\n⚠️ RLS policy blocked insertion. Generating SQL for manual insert...\n');
        
        // Generate SQL that can be run in Supabase Dashboard
        console.log('-- Copy and run this SQL in Supabase Dashboard SQL Editor:');
        console.log('-- Make sure to run with service role or disable RLS temporarily\n');
        
        const sqlValues = records.map(r => {
          return `('${r.vendor_record_id}', '${r.device_no}', '${r.user_id}', ${r.merchant_id ? `'${r.merchant_id}'` : 'NULL'}, '${r.waste_type}', ${r.api_weight}, ${r.calculated_value}, ${r.rate_per_kg}, '${r.status}', 'SEED', '${r.submitted_at}')`;
        }).join(',\n');
        
        console.log(`INSERT INTO submission_reviews 
(vendor_record_id, device_no, user_id, merchant_id, waste_type, api_weight, calculated_value, rate_per_kg, status, source, submitted_at)
VALUES 
${sqlValues};`);
        
        console.log('\n✅ SQL generated above. Run it in Supabase Dashboard SQL Editor.');
        return;
      }
      throw error;
    }

    console.log(`✓ Successfully inserted ${data?.length || 0} records!`);
    console.log(`\nSummary:`);
    console.log(`- PET Plastic: ${PET_WEIGHT}kg`);
    console.log(`- Aluminum: ${ALUMINUM_WEIGHT}kg`);
    console.log(`- Total: ${TOTAL_WEIGHT}kg`);
    console.log(`- Date range: ${START_DATE} to ${END_DATE}`);
    console.log(`- Device: ${deviceNo}`);

  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seedData();