import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

// 1. Initialize Supabase (Server-Side)
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const BATCH_SIZE = 5; // Lower batch size to prevent timeouts
const FETCH_LIMIT = 20; // Check last 20 records per user

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 🔒 Security: Require a secret key in the URL
  // Example URL: https://your-app.vercel.app/api/cron-daily-harvest?key=YOUR_SECRET_KEY
  if (req.query.key !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log("🚜 [CRON] Starting Daily Harvest...");

    // 1. Get Users (Sorted by oldest sync first)
    const { data: users } = await supabase
        .from('users')
        .select('id, phone, last_synced_at')
        .order('last_synced_at', { ascending: true, nullsFirst: true })
        .limit(50); // Process max 50 users per run to fit in execution time

    if (!users || users.length === 0) {
        return res.status(200).json({ message: "No users to sync" });
    }

    // 2. Load Machine Map (Cache rates from DB to save API calls)
    const { data: machines } = await supabase
        .from('machines')
        .select('device_no, merchant_id, rate_plastic, rate_can, rate_paper, rate_uco, rate_glass, config_bin_1, config_bin_2');
    
    const machineMap: Record<string, any> = {};
    machines?.forEach(m => {
        if (m?.device_no) machineMap[m.device_no] = m;
    });

    let totalImported = 0;
    const now = new Date();

    // 3. Process Users
    for (const user of users) {
        // Skip if synced recently (e.g., last 10 mins)
        if (user.last_synced_at) {
            const diff = (now.getTime() - new Date(user.last_synced_at).getTime()) / 60000;
            if (diff < 10) continue;
        }

        // Update Sync Time
        await supabase.from('users').update({ last_synced_at: now.toISOString() }).eq('id', user.id);

        // Fetch External API
        const apiRecords = await fetchExternalRecords(user.phone);
        
        if (apiRecords && apiRecords.length > 0) {
            // Process Records
            const count = await processUserRecords(user, apiRecords, machineMap);
            totalImported += count;
        }
    }

    console.log(`✅ [CRON] Complete. Imported ${totalImported} records.`);
    return res.status(200).json({ success: true, imported: totalImported });

  } catch (error: any) {
    console.error("❌ [CRON] Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

// --------------------------------------------------------
// RECORD PROCESSOR
// --------------------------------------------------------
async function processUserRecords(user: any, apiRecords: any[], machineMap: Record<string, any>) {
    let importedCount = 0;

    // 1. Get existing IDs to prevent duplicates
    const remoteIds = apiRecords.map((r: any) => r.id);
    const { data: existingRows } = await supabase
        .from('submission_reviews')
        .select('vendor_record_id, status, id')
        .in('vendor_record_id', remoteIds);

    const existingMap = new Map(existingRows?.map(r => [r.vendor_record_id, r]));

    for (const record of apiRecords) {
        const existing = existingMap.get(record.id);
        const machinePoints = Number(record.integral || 0);

        // A. CHECK FOR CLEANING (Using your robust logic)
        if (Number(record.weight) > 0) {
            await checkCleaningEvent(record);
        }

        // B. HANDLE EXISTING RECORDS (Auto-Fix)
        if (existing) {
            if (existing.status === 'PENDING' && machinePoints > 0) {
                await supabase.from('submission_reviews').update({
                    status: 'VERIFIED',
                    confirmed_weight: record.weight,
                    calculated_points: machinePoints,
                    machine_given_points: machinePoints,
                    reviewed_at: new Date().toISOString()
                }).eq('id', existing.id);
            }
            continue; // Skip insertion
        }

        // C. INSERT NEW RECORD
        const machine = machineMap[record.deviceNo];
        if (!machine) continue;

        const weight = Number(record.weight || 0);
        let wasteType = detectWasteType(record);
        
        // Rate Calculation
        let rate = 0;
        const typeKey = wasteType.toLowerCase();
        if (typeKey.includes('paper')) rate = Number(machine.rate_paper || 0);
        else if (typeKey.includes('uco')) rate = Number(machine.rate_uco || 0);
        else if (typeKey.includes('glass')) rate = Number(machine.rate_glass || 0);
        else if (typeKey.includes('can')) rate = Number(machine.rate_can || 0);
        else rate = Number(machine.rate_plastic || 0);

        const calculatedValue = Number((weight * rate).toFixed(2));
        const isVerified = machinePoints > 0;

        await supabase.from('submission_reviews').insert({
            vendor_record_id: record.id,
            user_id: user.id,
            phone: user.phone,
            merchant_id: machine.merchant_id,
            device_no: record.deviceNo,
            waste_type: wasteType,
            api_weight: weight,
            calculated_value: calculatedValue,
            rate_per_kg: rate,
            photo_url: record.imgUrl,
            submitted_at: record.createTime,
            status: isVerified ? 'VERIFIED' : 'PENDING',
            confirmed_weight: isVerified ? weight : 0,
            calculated_points: machinePoints, // For reference
            machine_given_points: machinePoints,
            bin_weight_snapshot: record.positionWeight || 0,
            source: 'CRON_JOB'
        });
        
        importedCount++;
    }
    return importedCount;
}

// --------------------------------------------------------
// CLEANING CHECKER
// --------------------------------------------------------
async function checkCleaningEvent(apiRecord: any) {
    try {
        const currentWeight = Number(apiRecord.positionWeight || 0);
        
        // Find Previous Submission
        const { data: lastRecord } = await supabase
            .from('submission_reviews')
            .select('bin_weight_snapshot, waste_type, photo_url')
            .eq('device_no', apiRecord.deviceNo)
            .lt('submitted_at', apiRecord.createTime) 
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!lastRecord) return; 

        const previousWeight = Number(lastRecord.bin_weight_snapshot || 0);

        // Logic: Weight Drop > 0.5kg
        if (previousWeight > 0.5 && currentWeight < 1.0 && currentWeight < previousWeight) {
            
            // Deduplication
            const { data: existingClean } = await supabase
                .from('cleaning_records')
                .select('id')
                .eq('device_no', apiRecord.deviceNo)
                .eq('cleaned_at', apiRecord.createTime)
                .maybeSingle();

            if (!existingClean) {
                console.log(`🧹 [CRON] Cleaning: ${apiRecord.deviceNo}`);
                await supabase.from('cleaning_records').insert({
                    device_no: apiRecord.deviceNo,
                    cleaned_at: apiRecord.createTime, 
                    waste_type: lastRecord.waste_type || 'Unknown',
                    bag_weight_collected: previousWeight,
                    photo_url: lastRecord.photo_url, 
                    status: 'PENDING'
                });
            }
        }
    } catch (e) {
        console.error("Cleaning check error", e);
    }
}

// --------------------------------------------------------
// HELPERS
// --------------------------------------------------------
function detectWasteType(record: any): string {
    const rawName = record.rubbishLogDetailsVOList?.[0]?.rubbishName || '';
    const typeKey = rawName.toLowerCase();
    
    if (typeKey.includes('paper') || typeKey.includes('纸')) return 'Paper';
    if (typeKey.includes('can') || typeKey.includes('罐')) return 'Aluminium Can';
    if (typeKey.includes('glass') || typeKey.includes('玻')) return 'Glass';
    if (typeKey.includes('oil') || typeKey.includes('油')) return 'UCO';
    return 'Plastic';
}

async function fetchExternalRecords(phone: string) {
    const HOST = "https://api.autogcm.com"; 
    const MERCHANT_NO = process.env.VITE_MERCHANT_NO; 
    const SECRET = process.env.VITE_API_SECRET;

    if (!MERCHANT_NO || !SECRET) return [];

    try {
        const timestamp = Date.now().toString();
        const rawSign = MERCHANT_NO + SECRET + timestamp;
        const sign = crypto.createHash('md5').update(rawSign).digest('hex');

        // ✅ FIXED: Changed to GET and correct endpoint to match autogcm.ts
        const res = await axios.get(`${HOST}/api/open/v1/put`, {
            params: {
                phone: phone,
                pageNum: 1,       // Match autogcm.ts
                pageSize: FETCH_LIMIT 
            },
            headers: {
                'Merchant-no': MERCHANT_NO,
                'timestamp': timestamp,
                'sign': sign,
                'Content-Type': 'application/json'
            }
        });

        // The API returns { code: 200, data: { list: [] } }
        if (res.data.code === 200 && res.data.data) {
            return res.data.data.list || [];
        }
        return [];
    } catch (e: any) {
        console.error(`API Fetch failed for ${phone}: ${e.message}`);
        return [];
    }
}