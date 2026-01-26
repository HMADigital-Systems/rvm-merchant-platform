import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

// Configuration
const FETCH_LIMIT = 50; 

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Security Check
  if (req.query.key !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
  }

  const targetPhone = req.query.phone as string;
  const debugLogs: string[] = [];
  
  const log = (msg: string) => {
      console.log(msg);
      debugLogs.push(msg);
  };

  if (!targetPhone) {
      return res.status(400).json({ error: "Please provide a 'phone' query parameter." });
  }

  try {
    log(`🔍 [DEBUG] Starting investigation for user: ${targetPhone}`);

    // 1. Check User in DB
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, phone, last_synced_at')
        .eq('phone', targetPhone)
        .single();

    if (userError || !user) {
        log(`❌ User not found in Supabase DB.`);
        return res.json({ logs: debugLogs });
    }
    log(`✅ User found (ID: ${user.id}). Last Synced: ${user.last_synced_at}`);

    // 2. Load Machines
    const { data: machines } = await supabase.from('machines').select('device_no, merchant_id');
    const machineMap: Record<string, any> = {};
    machines?.forEach(m => { if (m?.device_no) machineMap[m.device_no] = m; });
    log(`ℹ️ Loaded ${machines?.length || 0} machines from DB.`);

    // 3. Fetch External API
    log(`📡 Fetching data from AutoGCM...`);
    const apiRecords = await fetchExternalRecords(targetPhone);
    log(`abc Received ${apiRecords.length} records from External API.`);

    if (apiRecords.length === 0) {
        log("⚠️ No records returned from API. Check if user has recycled recently.");
        return res.json({ logs: debugLogs });
    }

    // 4. Process Records (Dry Run)
    const remoteIds = apiRecords.map((r: any) => r.id);
    const { data: existingRows } = await supabase
        .from('submission_reviews')
        .select('vendor_record_id')
        .in('vendor_record_id', remoteIds);
    
    const existingSet = new Set(existingRows?.map(r => r.vendor_record_id));
    
    let newCount = 0;

    for (const record of apiRecords) {
        const shortId = record.id.substring(record.id.length - 6);
        
        // CHECK A: Is it a duplicate?
        if (existingSet.has(record.id)) {
            // log(`⏭️ Skipped Record ...${shortId}: Already exists in DB.`);
            continue; 
        }

        // CHECK B: Does machine exist?
        const machine = machineMap[record.deviceNo];
        if (!machine) {
            log(`❌ REJECTED Record ...${shortId}: Device '${record.deviceNo}' NOT FOUND in machines table.`);
            continue;
        }

        // CHECK C: Valid Weight?
        const weight = Number(record.weight || 0);
        if (weight <= 0) {
            log(`⚠️ Skipped Record ...${shortId}: Weight is 0.`);
            continue;
        }

        log(`✅ READY TO INSERT Record ...${shortId}: Device ${record.deviceNo}, ${weight}kg`);
        newCount++;
    }

    log(`🏁 Diagnosis Complete. ${newCount} new records would be inserted.`);

    return res.status(200).json({ 
        success: true, 
        user_phone: targetPhone,
        records_found: apiRecords.length,
        new_records_identified: newCount,
        logs: debugLogs 
    });

  } catch (error: any) {
    log(`❌ Critical Error: ${error.message}`);
    return res.status(500).json({ error: error.message, logs: debugLogs });
  }
}

// Reuse your existing fetcher
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
        return [];
    }
}