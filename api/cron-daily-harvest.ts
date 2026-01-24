import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

// --------------------------------------------------------
// CONFIGURATION
// --------------------------------------------------------
const BATCH_SIZE = 5;       // Process 5 users in parallel (Safe for API limits)
const USER_LIMIT_PER_RUN = 50; // Process max 50 users per execution (Safe for Vercel 10s timeout)
const FETCH_LIMIT = 50;     // Fetch last 50 records per user
// SET TO 0: If we want "Force Sync" style behavior, we consider anyone not synced "just now" as valid targets.
// However, to prevent the 12:02 run from re-picking the 12:00 users, we keep a small buffer.
const SYNC_COOLDOWN_HOURS = 2; 

const UCO_DEVICES = ['071582000007', '071582000009'];

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 🔒 Security Check
  if (req.query.key !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log("🚜 [CRON] Starting Batched Harvest...");

    // 1. Define "Stale" Cutoff
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - SYNC_COOLDOWN_HOURS);

    // 2. Count Total Pending Users (For Logging/Debugging)
    // This tells us if our "Burst" is big enough
    const { count: pendingCount } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .or(`last_synced_at.is.null,last_synced_at.lt.${cutoffDate.toISOString()}`);

    // 3. Fetch Batch of Users (Oldest Synced First)
    const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, phone, last_synced_at')
        .or(`last_synced_at.is.null,last_synced_at.lt.${cutoffDate.toISOString()}`)
        .order('last_synced_at', { ascending: true, nullsFirst: true }) // CRITICAL: Always pick the ones waiting longest
        .limit(USER_LIMIT_PER_RUN);

    if (userError) throw new Error(`User Fetch Error: ${userError.message}`);

    if (!users || users.length === 0) {
        console.log("✅ All users are up to date.");
        return res.status(200).json({ message: "All users up to date.", remaining: 0 });
    }

    console.log(`Processing ${users.length} users. (${pendingCount || 0} total pending in queue)`);

    // 4. Load Machine Map
    const { data: machines } = await supabase
        .from('machines')
        .select('device_no, merchant_id, rate_plastic, rate_can, rate_paper, rate_uco, rate_glass');
    
    const machineMap: Record<string, any> = {};
    machines?.forEach(m => { if (m?.device_no) machineMap[m.device_no] = m; });

    let totalImported = 0;
    const now = new Date();

    // 5. Process Batch
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const chunk = users.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.allSettled(chunk.map(async (user) => {
            // ✅ OPTIMISTIC LOCK: Update timestamp immediately so the next "Burst" run ignores these users
            await supabase.from('users').update({ last_synced_at: now.toISOString() }).eq('id', user.id);
            
            const apiRecords = await fetchExternalRecords(user.phone);
            
            if (apiRecords && apiRecords.length > 0) {
                apiRecords.sort((a: any, b: any) => new Date(a.createTime).getTime() - new Date(b.createTime).getTime());
                return await processUserRecords(user, apiRecords, machineMap);
            }
            return 0;
        }));

        results.forEach(r => {
            if (r.status === 'fulfilled') totalImported += r.value;
            else console.error("❌ Batch Error:", r.reason);
        });
    }

    const remaining = (pendingCount || 0) - users.length;
    console.log(`✅ [CRON] Batch Complete. Imported: ${totalImported}. Remaining in Queue: ${remaining}`);
    
    return res.status(200).json({ 
        success: true, 
        imported: totalImported, 
        processed: users.length,
        remaining_in_queue: remaining 
    });

  } catch (error: any) {
    console.error("❌ [CRON] Critical Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ... (Keep existing fetchExternalRecords, processUserRecords, checkCleaningEvent, detectWasteType helpers exactly as they are) ...
// --------------------------------------------------------
// API HELPERS (Paste the same helper functions here from previous response)
// --------------------------------------------------------

async function fetchExternalRecords(phone: string) {
    const HOST = "https://api.autogcm.com"; 
    const MERCHANT_NO = process.env.VITE_MERCHANT_NO;
    const SECRET = process.env.API_SECRET; 

    if (!MERCHANT_NO || !SECRET) return [];

    try {
        const timestamp = Date.now().toString();
        const rawSign = MERCHANT_NO + SECRET + timestamp;
        const sign = crypto.createHash('md5').update(rawSign).digest('hex');

        const res = await axios.get(`${HOST}/api/open/v1/put`, {
            params: { phone: phone, pageNum: 1, pageSize: FETCH_LIMIT },
            headers: {
                'Merchant-no': MERCHANT_NO,
                'timestamp': timestamp,
                'sign': sign,
                'Content-Type': 'application/json'
            },
            timeout: 5000 
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

async function processUserRecords(user: any, apiRecords: any[], machineMap: Record<string, any>) {
    let importedCount = 0;
    
    // Bulk fetch existing IDs
    const remoteIds = apiRecords.map((r: any) => r.id);
    const { data: existingRows } = await supabase
        .from('submission_reviews')
        .select('vendor_record_id, status, id')
        .in('vendor_record_id', remoteIds);

    const existingMap = new Map(existingRows?.map(r => [r.vendor_record_id, r]));
    const recordsToInsert: any[] = [];

    for (const record of apiRecords) {
        const existing = existingMap.get(record.id);
        
        // 1. Cleaning Check
        if (Number(record.weight) > 0) {
             await checkCleaningEvent(record);
        }

        // 2. Handle Existing (Update if pending -> verified)
        if (existing) {
             const machinePoints = Number(record.integral || 0);
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

        // 3. Prepare New Record
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
        const machinePoints = Number(record.integral || 0);
        const isVerified = machinePoints > 0;

        recordsToInsert.push({
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

    if (recordsToInsert.length > 0) {
        await supabase.from('submission_reviews').insert(recordsToInsert);
    }

    return importedCount;
}

async function checkCleaningEvent(apiRecord: any) {
    try {
        const currentWeight = Number(apiRecord.positionWeight || 0);
        const userWeight = Number(apiRecord.weight || 0); 
        
        if (userWeight > 0 && currentWeight < 0.1) return;
        const isUCO = UCO_DEVICES.includes(apiRecord.deviceNo);
        if (isUCO && currentWeight < 0.1) return;

        const { data: lastRecord } = await supabase
            .from('submission_reviews')
            .select('bin_weight_snapshot, waste_type, photo_url, submitted_at') // Added submitted_at
            .eq('device_no', apiRecord.deviceNo)
            .lt('submitted_at', apiRecord.createTime) 
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!lastRecord) return; 

        const previousWeight = Number(lastRecord.bin_weight_snapshot || 0);

        if (previousWeight > 0.5 && currentWeight < 2.0 && currentWeight < previousWeight) {
            
            const { data: existingClean } = await supabase
                .from('cleaning_records')
                .select('id')
                .eq('device_no', apiRecord.deviceNo)
                .gte('cleaned_at', lastRecord.submitted_at || new Date(0).toISOString()) 
                .lte('cleaned_at', apiRecord.createTime)
                .limit(1); 

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

function detectWasteType(record: any): string {
    const rawName = record.rubbishLogDetailsVOList?.[0]?.rubbishName || '';
    const typeKey = rawName.toLowerCase();
    
    if (typeKey.includes('paper') || typeKey.includes('纸')) return 'Paper';
    if (typeKey.includes('can') || typeKey.includes('罐')) return 'Aluminium Can';
    if (typeKey.includes('glass') || typeKey.includes('玻')) return 'Glass';
    if (typeKey.includes('oil') || typeKey.includes('油')) return 'UCO';
    return 'Plastic';
}