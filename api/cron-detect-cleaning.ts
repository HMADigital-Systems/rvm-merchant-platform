import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// 1. Initialize Supabase (Use Service Role for Admin Access)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Security Check
  if (req.query.key !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log("🔍 [CRON] Starting Historical Cleaning Detection...");

    // 1. Get all active devices to check
    const { data: devices } = await supabase
        .from('machines')
        .select('device_no, merchant_id')
        .eq('is_active', true);

    if (!devices) return res.status(200).json({ msg: "No devices found" });

    let newCleaningEvents = 0;

    // 2. Loop through each device
    for (const machine of devices) {
        // Fetch submissions from the last 24 hours, ordered by time (Oldest -> Newest)
        const { data: submissions } = await supabase
            .from('submission_reviews')
            .select('id, submitted_at, bin_weight_snapshot, waste_type, photo_url')
            .eq('device_no', machine.device_no)
            .gte('submitted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) 
            .order('submitted_at', { ascending: true });

        if (!submissions || submissions.length < 2) continue;

        // 3. Analyze the Sequence
        for (let i = 1; i < submissions.length; i++) {
            const prev = submissions[i - 1];
            const curr = submissions[i];

            const prevWeight = Number(prev.bin_weight_snapshot || 0);
            const currWeight = Number(curr.bin_weight_snapshot || 0);

            // --- DETECTION LOGIC ---
            // 1. Bin was relatively full (> 0.5kg)
            // 2. Bin is now relatively empty (< 1.5kg)
            // 3. Weight dropped significantly (Current < Previous)
            if (prevWeight > 0.5 && currWeight < 1.5 && currWeight < prevWeight) {
                
                // We detected a cleaning happened between 'prev' and 'curr'
                
                // 4. Check for duplicates
                // We check if a cleaning record ALREADY exists for this device 
                // within the specific time window between these two submissions.
                const { data: existing } = await supabase
                    .from('cleaning_records')
                    .select('id')
                    .eq('device_no', machine.device_no)
                    .gte('cleaned_at', prev.submitted_at) // After previous submission
                    .lte('cleaned_at', curr.submitted_at) // Before/At current submission
                    .limit(1);

                if (!existing || existing.length === 0) {
                    console.log(`🧹 Detected Cleaning on ${machine.device_no}: ${prevWeight}kg -> ${currWeight}kg`);

                    // 5. Insert Record
                    await supabase.from('cleaning_records').insert({
                        device_no: machine.device_no,
                        merchant_id: machine.merchant_id,
                        waste_type: prev.waste_type || 'Unknown',
                        
                        // We record the max weight observed before emptying
                        bag_weight_collected: prevWeight, 
                        
                        // We assume cleaning happened closer to the 'current' submission 
                        // or just use current time as discovery time
                        cleaned_at: curr.submitted_at, 
                        
                        // Use the photo of the FULL bin as evidence
                        photo_url: prev.photo_url, 
                        
                        cleaner_name: 'System Detected (History)',
                        status: 'PENDING'
                    });

                    newCleaningEvents++;
                }
            }
        }
    }

    return res.status(200).json({ 
        success: true, 
        events_detected: newCleaningEvents,
        message: `Successfully scanned ${devices.length} devices and found ${newCleaningEvents} missed cleaning events.`
    });

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}