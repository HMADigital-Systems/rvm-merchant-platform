import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Method Check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const data = req.body;
  console.log("🔔 Webhook Received:", JSON.stringify(data, null, 2));

  try {
    // ---------------------------------------------------------
    // STEP A: Always Save Raw Log (Safety Net)
    // ---------------------------------------------------------
    // This assumes you have the 'machine_logs' table created
    await supabase.from('machine_logs').insert([
      {
        device_no: data.deviceNo || 'UNKNOWN',
        type: data.type, // 'PUT', 'OVERFLOW', 'BINDING_CARD'
        payload: data,   // Stores the full JSON
        vendor_user_no: data.userId ? String(data.userId) : null
      }
    ]);

    // ---------------------------------------------------------
    // STEP B: Handle "PUT" (Disposal Event)
    // ---------------------------------------------------------
    if (data.type === 'PUT') {
      const { 
        userId,       // Maps to users.vendor_user_no
        deviceNo, 
        putId,        // Maps to vendor_record_id
        totalWeight,  // Maps to api_weight
        integral,     // Maps to machine_given_points
        phone,
        imgUrl,       // Maps to photo_url
        userRubbishPutDetailsVOList 
      } = data;

      // 1. Find the User's UUID from your DB
      const { data: userData } = await supabase
        .from('users')
        .select('id, phone')
        .eq('vendor_user_no', String(userId))
        .single();
      
      const internalUserId = userData?.id || null;
      const userPhone = userData?.phone || phone; 

      // 2. Determine Waste Type (Take the first one)
      const wasteType = userRubbishPutDetailsVOList?.[0]?.rubbishName || 'Unknown';

      // 3. Insert into submission_reviews
      // We match the columns from your CREATE TABLE statement exactly
      const { error: reviewError } = await supabase
        .from('submission_reviews')
        .upsert([
          {
            vendor_record_id: String(putId), // Unique Key
            user_id: internalUserId,
            phone: userPhone,
            device_no: deviceNo,
            waste_type: wasteType,
            
            // Weights & Points Mapping
            api_weight: totalWeight,
            machine_given_points: integral,
            
            // Photos
            photo_url: imgUrl,
            
            // Metadata
            status: 'PENDING',
            source: 'WEBHOOK', // The new column we just added
            submitted_at: new Date().toISOString()
          }
        ], { onConflict: 'vendor_record_id' }); // Prevent duplicates

      if (reviewError) {
        console.error("❌ Failed to insert review:", reviewError);
      } else {
        console.log("✅ Submission Review Saved");
      }
    }

    // ---------------------------------------------------------
    // STEP C: Handle "OVERFLOW" (Bin Full)
    // ---------------------------------------------------------
    if (data.type === 'OVERFLOW') {
      const { deviceNo, positionNo, description } = data;
      console.warn(`⚠️ BIN FULL: Device ${deviceNo} Position ${positionNo}`);
      
      // Update your machines table (optional)
      await supabase
        .from('machines')
        .update({ is_active: false }) // Example action
        .eq('device_no', deviceNo);
    }

    return res.status(200).json({ msg: "Success" });

  } catch (error: any) {
    console.error("❌ Webhook Logic Error:", error.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}