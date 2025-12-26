import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Method Check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const data = req.body;
  console.log("🔔 [START] Webhook Received:", JSON.stringify(data, null, 2));

  try {
    // 2. Log Raw Data to machine_logs
    const { error: logError } = await supabase.from('machine_logs').insert([{
        device_no: data.deviceNo || 'UNKNOWN',
        type: data.type,
        payload: data,
        vendor_user_no: data.userId ? String(data.userId) : null
    }]);
    
    if (logError) {
        console.error("❌ [LOGGING FAILED]:", logError.message);
    } else {
        console.log("✅ [LOGGING SUCCESS]: Raw data saved.");
    }

    // ---------------------------------------------------------
    // STEP B: Handle "PUT" (Disposal Event)
    // ---------------------------------------------------------
    if (data.type === 'PUT') {
      const { 
        userId, deviceNo, putId, totalWeight, integral, phone, imgUrl, 
        userRubbishPutDetailsVOList, positionWeight 
      } = data;

      console.log(`🔎 [LOOKUP]: Searching for machine '${deviceNo}'...`);

      // A. Parse Current Bin State
      const firstItem = userRubbishPutDetailsVOList?.[0] || {};
      const wasteType = firstItem.rubbishName || 'Unknown';
      
      // Priority: Root positionWeight -> List item positionWeight -> 0
      const currentBinLevel = Number(positionWeight || firstItem.positionWeight || 0);
      
      console.log(`⚖️ [WEIGHT]: Current Bin Level parsed as: ${currentBinLevel} kg`);

      // B. Fetch Last Known Machine State (Memory)
      const { data: machineState, error: machineError } = await supabase
        .from('machines')
        .select('id, current_bag_weight')
        .eq('device_no', String(deviceNo))
        .single();

      if (machineError) {
        console.error("❌ [DB ERROR]: Machine lookup failed -", machineError.message);
      } else if (!machineState) {
        console.error("❌ [NOT FOUND]: No machine row found for device_no:", deviceNo);
      } else {
        // Machine Found - Proceed with Logic
        console.log("✅ [FOUND]: Machine ID:", machineState.id, "| Last Memory:", machineState.current_bag_weight);
        
        const lastKnownWeight = Number(machineState.current_bag_weight || 0);

        // C. Cleaning Detection Logic
        if (lastKnownWeight > 3.0 && currentBinLevel < 1.0) {
            console.log(`🧹 [CLEANING DETECTED]: Drop from ${lastKnownWeight}kg to ${currentBinLevel}kg`);
            
            const { error: cleanError } = await supabase.from('cleaning_records').insert([{
               device_no: deviceNo,
               waste_type: wasteType,
               bag_weight_collected: lastKnownWeight, // Record the weight BEFORE emptying
               cleaned_at: new Date().toISOString(),
               status: 'PENDING',
               photo_url: imgUrl,
               cleaner_name: 'System Detected (Webhook)'
            }]);

            if (cleanError) console.error("❌ [INSERT CLEANING FAILED]:", cleanError.message);
            else console.log("✅ [CLEANING RECORD SAVED]");

        } else {
            console.log(`ℹ️ [NO CLEANING]: Weight change (${lastKnownWeight} -> ${currentBinLevel}) is normal fill-up.`);
        }

        // D. Update Machine Memory
        const { error: updateError } = await supabase
          .from('machines')
          .update({ current_bag_weight: currentBinLevel })
          .eq('id', machineState.id);

        if (updateError) console.error("❌ [UPDATE MEMORY FAILED]:", updateError.message);
        else console.log("✅ [MEMORY UPDATED]: Database now matches Machine.");
      }

      // E. User Submission Logic
      console.log("📝 [SUBMISSION]: Processing User Points...");

      // 1. Find Internal User ID
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, phone')
        .eq('vendor_user_no', String(userId))
        .single();
      
      if (userError) console.warn("⚠️ [USER LOOKUP]:", userError.message);

      const internalUserId = userData?.id || null;
      const userPhone = userData?.phone || phone; 

      // 2. Insert Submission Review
      const { error: reviewError } = await supabase
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
            bin_weight_snapshot: currentBinLevel // Save for reference
          }
        ], { onConflict: 'vendor_record_id' });

      if (reviewError) console.error("❌ [REVIEW INSERT FAILED]:", reviewError.message);
      else console.log("✅ [REVIEW SAVED]");
    }

    return res.status(200).json({ msg: "Success" });

  } catch (error: any) {
    console.error("🔥 [CRITICAL HANDLER ERROR]:", error.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}