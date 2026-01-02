import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APP_URL = 'https://rvm-merchant-platform.vercel.app';

export default async function handler(req, res) {
  // 1. Security Check
  if (req.query.key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 2. Fetch Active Machines
    const { data: machines, error } = await supabase
      .from('machines')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;

    let updatesCount = 0;
    let cleaningEvents = 0;

    // 3. Loop through machines
    for (const machine of machines) {
      try {
        const proxyRes = await fetch(`${APP_URL}/api/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                endpoint: '/api/open/v1/device/position',
                method: 'GET',
                params: { deviceNo: machine.device_no }
            })
        });

        const apiRes = await proxyRes.json();
        const bins = (apiRes && apiRes.data) ? apiRes.data : [];

        // --- BIN 1 PROCESSING ---
        const bin1 = Array.isArray(bins) ? bins.find((b: any) => b.positionNo === 1) : null;
        if (bin1) {
          await processBin(machine, 1, bin1.weight, machine.current_bag_weight);
        }

        // --- BIN 2 PROCESSING ---
        const bin2 = Array.isArray(bins) ? bins.find((b: any) => b.positionNo === 2) : null;
        if (bin2) {
          await processBin(machine, 2, bin2.weight, machine.current_weight_2);
        }

        updatesCount++;

      } catch (innerErr) {
        console.error(`Error processing ${machine.device_no}:`, innerErr);
      }
    }

    return res.status(200).json({ 
      success: true, 
      machinesChecked: updatesCount, 
      cleaningEventsDetected: cleaningEvents 
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }

  // --- HELPER FUNCTION ---
  async function processBin(machine: any, position: number, liveWeightStr: string, dbWeightNum: number) {
      const liveWeight = Number(liveWeightStr || 0);
      const dbWeight = Number(dbWeightNum || 0);
      const DROP_THRESHOLD = 2.0; 

      // 1. Detect Drop (Cleaning Event)
      if (dbWeight - liveWeight > DROP_THRESHOLD) {
          console.log(`🧹 Cleaning Detected: ${machine.device_no}`);
          
          await supabase.from('cleaning_records').insert({
              device_no: machine.device_no,
              merchant_id: machine.merchant_id,
              waste_type: position === 1 ? machine.config_bin_1 : machine.config_bin_2,
              bag_weight_collected: dbWeight,
              cleaned_at: new Date().toISOString(),
              cleaner_name: 'System Detected (Auto)',
              status: 'PENDING'
          });
          
          cleaningEvents++;
      }

      // 2. Update Machine Weight in DB (Crucial Step!)
      // We update the DB to match the new "Live" weight so the cycle resets
      if (Math.abs(liveWeight - dbWeight) > 0.05) {
          const updateField = position === 1 ? 'current_bag_weight' : 'current_weight_2';
          await supabase
            .from('machines')
            .update({ [updateField]: liveWeight })
            .eq('id', machine.id);
      }
  }
}