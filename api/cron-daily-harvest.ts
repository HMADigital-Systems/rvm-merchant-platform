import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

// 1. Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; 

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Env Vars for Supabase");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const USERS_PER_RUN = 10; // ✅ Reduced from 50 to prevent timeout
const FETCH_LIMIT = 20; 
const UCO_DEVICES = ['071582000007', '071582000009']; // ✅ For Safeguard

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 🔒 Security Check
  if (req.query.key !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log("🚜 [CRON] Starting Daily Harvest...");

    // 1. Get Users (Sorted by oldest sync first)
    const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, phone, last_synced_at')
        .order('last_synced_at', { ascending: true, nullsFirst: true })
        .limit(USERS_PER_RUN); // ✅ Use the smaller limit

    if (userError) throw new Error(`User Fetch Error: ${userError.message}`);

    if (!users || users.length === 0) {
        return res.status(200).json({ message: "No users to sync" });
    }

    console.log(`🔎 Processing batch of ${users.length} users...`);

    // 2. Load Machine Map
    const { data: machines } = await supabase
        .from('machines')
        .select('device_no, merchant_id, rate_plastic, rate_can, rate_paper, rate_uco, rate_glass');
    
    const machineMap: Record<string, any> = {};
    machines?.forEach(m => {
        if (m?.device_no) machineMap[m.device_no] = m;
    });

    let totalImported = 0;
    const now = new Date();

    // 3. Process Users in PARALLEL (Promise.all)
    // ✅ This runs all 10 users at the same time, instead of waiting 1-by-1
    const results = await Promise.allSettled(users.map(async (user) => {
        
        // Cooldown Check (10 mins)
        if (user.last_synced_at) {
            const diff = (now.getTime() - new Date(user.last_synced_at).getTime()) / 60000;
            if (diff < 10) return 0; // Skip silent
        }

        // Fetch External API
        const apiRecords = await fetchExternalRecords(user.phone);
        
        let count = 0;
        if (apiRecords && apiRecords.length > 0) {
            // ✅ Sort Oldest -> Newest to ensure Cleaning Logic has history
            apiRecords.sort((a: any, b: any) => new Date(a.createTime).getTime() - new Date(b.createTime).getTime());
            
            count = await processUserRecords(user, apiRecords, machineMap);
        }

        // Update Sync Time
        await supabase.from('users').update({ last_synced_at: now.toISOString() }).eq('id', user.id);
        
        return count;
    }));

    // Tally results
    results.forEach(r => {
        if (r.status === 'fulfilled') totalImported += r.value;
        else console.error("❌ User Sync Failed:", r.reason);
    });

    console.log(`✅ [CRON] Complete. Total Imported: ${totalImported}`);
    return res.status(200).json({ success: true, imported: totalImported });

  } catch (error: any) {
    console.error("❌ [CRON] Critical Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

// --------------------------------------------------------
// RECORD PROCESSOR
// --------------------------------------------------------
async function processUserRecords(user: any, apiRecords: any[], machineMap: Record<string, any>) {
    let importedCount = 0;

    const remoteIds = apiRecords.map((r: any) => r.id);
    const { data: existingRows } = await supabase
        .from('submission_reviews')
        .select('vendor_record_id, status, id')
        .in('vendor_record_id', remoteIds);

    const existingMap = new Map(existingRows?.map(r => [r.vendor_record_id, r]));

    for (const record of apiRecords) {
        const existing = existingMap.get(record.id);
        const machinePoints = Number(record.integral || 0);

        // A. CHECK FOR CLEANING
        if (Number(record.weight) > 0) {
            await checkCleaningEvent(record);
        }

        // B. HANDLE EXISTING
        if (existing) {
            if (existing.status === 'PENDING' && machinePoints > 0) {
                await supabase.from('submission_reviews').update({
                    status: 'VERIFIED',
                    confirmed_weight: record.weight,
                    machine_given_points: machinePoints,
                    reviewed_at: new Date().toISOString()
                }).eq('id', existing.id);
            }
            continue; 
        }

        // C. INSERT NEW RECORD
        const machine = machineMap[record.deviceNo];
        if (!machine) continue;

        const weight = Number(record.weight || 0);
        let wasteType = detectWasteType(record);
        
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
            machine_given_points: machinePoints,
            bin_weight_snapshot: record.positionWeight || 0,
            source: 'CRON_JOB'
        });
        
        importedCount++;
    }
    return importedCount;
}

// --------------------------------------------------------
// CLEANING CHECKER (With Safeguards)
// --------------------------------------------------------
async function checkCleaningEvent(apiRecord: any) {
    try {
        const currentWeight = Number(apiRecord.positionWeight || 0);
        
        // ✅ UCO Safeguard: Ignore if machine reports 0kg glitch
        const isUCO = UCO_DEVICES.includes(apiRecord.deviceNo);
        if (isUCO && currentWeight < 0.1) return;

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

        // Logic: 
        // 1. Previous was Full (> 0.5kg)
        // 2. Current is Empty (< 2.0kg) - Increased threshold slightly for UCO tare
        // 3. Weight Dropped
        if (previousWeight > 0.5 && currentWeight < 2.0 && currentWeight < previousWeight) {
            
            const { data: existingClean } = await supabase
                .from('cleaning_records')
                .select('id')
                .eq('device_no', apiRecord.deviceNo)
                .gte('cleaned_at', lastRecord.submitted_at || new Date(0).toISOString()) // Ensure window is correct
                .lte('cleaned_at', apiRecord.createTime)
                .limit(1); // Use limit instead of maybeSingle for speed

            if (!existingClean || existingClean.length === 0) {
                console.log(`🧹 [CRON] Cleaning Detected: ${apiRecord.deviceNo}`);
                await supabase.from('cleaning_records').insert({
                    device_no: apiRecord.deviceNo,
                    cleaned_at: apiRecord.createTime, 
                    waste_type: lastRecord.waste_type || 'Unknown',
                    bag_weight_collected: previousWeight,
                    photo_url: lastRecord.photo_url, 
                    status: 'PENDING',
                    cleaner_name: 'System Detected (History)'
                });
            }
        }
    } catch (e) {
        console.error("Cleaning check error", e);
    }
}

// --------------------------------------------------------
// API HELPERS
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

        const res = await axios.get(`${HOST}/api/open/v1/put`, {
            params: {
                phone: phone,
                pageNum: 1, 
                pageSize: FETCH_LIMIT 
            },
            headers: {
                'Merchant-no': MERCHANT_NO,
                'timestamp': timestamp,
                'sign': sign,
                'Content-Type': 'application/json'
            },
            timeout: 5000 // ✅ 5s Timeout for external API
        });

        if (res.data.code === 200 && res.data.data) {
            return res.data.data.list || [];
        }
        return [];
    } catch (e: any) {
        console.error(`API Fetch failed for ${phone}: ${e.message}`);
        return [];
    }
}