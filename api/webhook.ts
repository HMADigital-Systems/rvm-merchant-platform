import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const data = req.body;

  try {
    if (data.type === 'PUT') {
      const { 
        userId, deviceNo, putId, totalWeight, integral, phone, imgUrl, 
        userRubbishPutDetailsVOList, positionWeight 
      } = data;

      // 1. Parse Data
      const firstItem = userRubbishPutDetailsVOList?.[0] || {};
      const wasteType = firstItem.rubbishName || 'Unknown';
      const currentBinLevel = Number(positionWeight || firstItem.positionWeight || 0);

      // 2. Fetch Machine State
      const { data: machineState } = await supabase
        .from('machines')
        .select('id, current_bag_weight')
        .eq('device_no', String(deviceNo))
        .single();

      if (machineState) {
        const lastKnownWeight = Number(machineState.current_bag_weight || 0);

        // 3. Cleaning Detection Logic
        // Trigger if weight drops from >3kg to <1kg
        if (lastKnownWeight > 3.0 && currentBinLevel < 1.0) {
            console.log(`🧹 Cleaning Detected on ${deviceNo}: ${lastKnownWeight}kg -> ${currentBinLevel}kg`);
            
            await supabase.from('cleaning_records').insert([{
               device_no: deviceNo,
               waste_type: wasteType,
               bag_weight_collected: lastKnownWeight,
               cleaned_at: new Date().toISOString(),
               status: 'PENDING',
               photo_url: imgUrl,
               cleaner_name: 'System Detected'
            }]);
        }

        // 4. Update Machine Memory
        await supabase
          .from('machines')
          .update({ current_bag_weight: currentBinLevel })
          .eq('id', machineState.id);
      } else {
          console.warn(`⚠️ Machine not found: ${deviceNo}`);
      }

      // 5. User Submission Logic
      const { data: userData } = await supabase
        .from('users')
        .select('id, phone')
        .eq('vendor_user_no', String(userId))
        .single();

      const internalUserId = userData?.id || null;
      const userPhone = userData?.phone || phone; 

      await supabase
        .from('submission_reviews')
        .upsert([
          {
            vendor_record_id: String(putId),
            user_id: internalUserId,
            phone: userPhone,
            device_no: deviceNo,
            waste_type: wasteType,
            api_weight: totalWeight,
            machine_given_points: integral,
            photo_url: imgUrl,
            status: 'PENDING',
            source: 'WEBHOOK',
            submitted_at: new Date().toISOString(),
            bin_weight_snapshot: currentBinLevel
          }
        ], { onConflict: 'vendor_record_id' });
    }

    return res.status(200).json({ msg: "Success" });

  } catch (error: any) {
    console.error("Webhook Error:", error.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}