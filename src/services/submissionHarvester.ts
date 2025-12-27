import { supabase } from '../services/supabase'; 
import { getUserRecords, getMachineConfig } from '../services/autogcm'; 
import { THEORETICAL_CONSTANTS, UCO_DEVICE_IDS, detectWasteType } from '../utils/wasteUtils';

export const runHarvester = async () => {
    try {
        console.log("🚜 [HARVESTER] Starting...");
        
        // 1. Get Users 
        const { data: users } = await supabase
            .from('users')
            .select('id, phone, nickname, last_synced_at')
            .order('last_synced_at', { ascending: true, nullsFirst: true });
        
        if (!users || users.length === 0) {
            console.log("⚠️ [HARVESTER] No users found in DB.");
            return;
        }

        console.log(`🔎 [HARVESTER] Checking ${users.length} users...`);
        const machineCache: Record<string, any[]> = {};
        let newRecordsCount = 0;
        const now = new Date();

        for (const user of users) {
            // OPTIMIZATION: Skip if synced less than 2 minutes ago
            if (user.last_synced_at) {
                const lastSync = new Date(user.last_synced_at);
                const diffMinutes = (now.getTime() - lastSync.getTime()) / 60000;
                if (diffMinutes < 2) {
                    console.log(`   ⏭️ Skipping ${user.phone} (Synced recently)`);
                    continue; 
                }
            }

            console.log(`   > Checking User: ${user.phone}...`);
            await supabase.from('users').update({ last_synced_at: now.toISOString() }).eq('id', user.id);

            const apiRecords = await getUserRecords(user.phone, 1, 10);
            
            if (!apiRecords || apiRecords.length === 0) continue;

            for (const record of apiRecords) {
                // ---------------------------------------------------------
                // 🔥 STEP A: CHECK FOR MISSED CLEANING
                // ---------------------------------------------------------
                // Even if we have the submission, we might have missed the cleaning event associated with it.
                await processPotentialCleaning(record);

                // ---------------------------------------------------------
                // 🔥 STEP B: CHECK FOR SUBMISSION
                // ---------------------------------------------------------
                const { data: existing } = await supabase
                    .from('submission_reviews')
                    .select('id, status')
                    .eq('vendor_record_id', record.id)
                    .maybeSingle();

                const machinePoints = Number(record.integral || 0);

                if (!existing) {
                    console.log(`   ✨ FOUND NEW: ${record.deviceNo} | ${record.weight}kg`);
                    await processSingleRecord(record, user, machineCache);
                    newRecordsCount++;
                } else {
                    // AUTO-FIX: If record is stuck in PENDING but Machine Paid Points -> VERIFY IT
                    if (existing.status === 'PENDING' && machinePoints > 0) {
                        console.log(`   🔄 AUTO-VERIFYING stuck record: ${record.deviceNo}`);
                        await supabase.from('submission_reviews').update({
                            status: 'VERIFIED',
                            confirmed_weight: record.weight,
                            calculated_points: machinePoints,
                            machine_given_points: machinePoints,
                            reviewed_at: new Date().toISOString()
                        }).eq('id', existing.id);
                    }
                }
            }
        }
        console.log(`✅ [HARVESTER] Done. Imported ${newRecordsCount} new records.`);

    } catch (err) {
        console.error("❌ [HARVESTER] Failed:", err);
        throw err;
    }
};

// ------------------------------------------------------------------
// 🧹 CLEANING DETECTION LOGIC (The New Function)
// ------------------------------------------------------------------
async function processPotentialCleaning(apiRecord: any) {
    try {
        const currentWeight = Number(apiRecord.positionWeight || 0);
        
        // 1. Find the PREVIOUS submission for this machine in our DB
        // We look for the most recent record BEFORE this API record's time
        const { data: lastRecord } = await supabase
            .from('submission_reviews')
            .select('bin_weight_snapshot, waste_type, submitted_at, photo_url')
            .eq('device_no', apiRecord.deviceNo)
            .lt('submitted_at', apiRecord.createTime) // Must be older than current record
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!lastRecord) return; // No history, can't compare

        const previousWeight = Number(lastRecord.bin_weight_snapshot || 0);

        // 2. THE LOGIC: Did the weight drop significantly?
        // - Previous was full (> 0.5kg)
        // - Current is empty (< 1.0kg)
        // - Current is less than Previous
        if (previousWeight > 0.5 && currentWeight < 1.0 && currentWeight < previousWeight) {
            
            // 3. Deduplication: Did we already log this cleaning?
            const { data: existingClean } = await supabase
                .from('cleaning_records')
                .select('id')
                .eq('device_no', apiRecord.deviceNo)
                .gt('cleaned_at', lastRecord.submitted_at) // Cleaning happened after last submission
                .lt('cleaned_at', apiRecord.createTime)    // Cleaning happened before current submission
                .maybeSingle();

            if (!existingClean) {
                console.log(`   🧹 [HARVESTER] MISSED CLEANING DETECTED! ${apiRecord.deviceNo}: ${previousWeight}kg -> ${currentWeight}kg`);
                
                // 4. Log it
                await supabase.from('cleaning_records').insert({
                    device_no: apiRecord.deviceNo,
                    // We estimate cleaning time as slightly before the new record
                    cleaned_at: apiRecord.createTime, 
                    waste_type: lastRecord.waste_type || 'Unknown',
                    bag_weight_collected: previousWeight,
                    photo_url: lastRecord.photo_url, // Use last known photo as evidence
                    status: 'PENDING'
                });
            }
        }
    } catch (err) {
        console.error("   ⚠️ Cleaning check failed:", err);
    }
}

// ------------------------------------------------------------------
// SUBMISSION LOGIC (Existing)
// ------------------------------------------------------------------
async function processSingleRecord(record: any, user: any, machineCache: Record<string, any[]>) {
    // ... (Keep your existing processSingleRecord logic exactly as it was) ...
    // Note: I am omitting the body of this function to save space, 
    // but you should keep the exact code you had in the previous file.
    
    let detailName = "";
    let detailPositionId = "";
    if (record.rubbishLogDetailsVOList && record.rubbishLogDetailsVOList.length > 0) {
        const detail = record.rubbishLogDetailsVOList[0];
        detailName = detail.rubbishName || "";
        detailPositionId = detail.positionId || "";
    }

    if (!machineCache[record.deviceNo]) {
        const config = await getMachineConfig(record.deviceNo);
        machineCache[record.deviceNo] = (config && config.data) ? config.data : [];
    }
    const machineBins = machineCache[record.deviceNo] || [];

    let finalWasteType = "Unknown";
    if (detailName) finalWasteType = detectWasteType(detailName);
    else if (detailPositionId) {
        if (UCO_DEVICE_IDS.includes(record.deviceNo)) finalWasteType = 'UCO';
        else if (String(detailPositionId) === '2') finalWasteType = 'Paper';
        else if (String(detailPositionId) === '1') finalWasteType = 'Plastik / Aluminium';
    }

    let finalRate = 0;
    const matchedBin = machineBins.find((bin: any) => {
        if (detailPositionId && (String(bin.rubbishType) === String(detailPositionId))) return true;
        const binName = bin.rubbishTypeName?.toLowerCase() || '';
        return binName.includes(finalWasteType.toLowerCase());
    });

    if (matchedBin) {
        finalRate = matchedBin.integral > 0 ? matchedBin.integral : matchedBin.amount;
    } else if (record.weight > 0) {
        const totalVal = Number(record.integral) || Number(record.amount) || 0;
        finalRate = totalVal / Number(record.weight);
    }

    const safeTypeStr = finalWasteType || 'plastic';
    const typeKey = safeTypeStr.toLowerCase().split('/')[0]?.trim() || 'plastic';
    const unitWeight = THEORETICAL_CONSTANTS[typeKey] || 0.05;
    const theoretical = (Number(record.weight) / unitWeight) * unitWeight;

    const machinePoints = Number(record.integral || 0);
    const isVerified = machinePoints > 0; 

    await supabase.from('submission_reviews').insert({
        vendor_record_id: record.id,
        user_id: user.id,
        phone: user.phone,
        device_no: record.deviceNo,
        waste_type: finalWasteType, 
        api_weight: record.weight,
        photo_url: record.imgUrl, 
        submitted_at: record.createTime,
        theoretical_weight: theoretical.toFixed(3),
        rate_per_kg: finalRate.toFixed(4), 
        status: isVerified ? 'VERIFIED' : 'PENDING',
        confirmed_weight: isVerified ? record.weight : 0, 
        calculated_points: machinePoints, 
        bin_weight_snapshot: record.positionWeight || 0, 
        machine_given_points: machinePoints,
        source: 'FETCH'
    });
}