import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import { getMachineConfig } from '../services/autogcm';

export function useBigDataStats() {
  const loading = ref(true);
  const statsLoading = ref(false);
  
  // Default to 'all' to show data immediately
  const timeFilter = ref('all'); 
  const dateRange = ref({ start: '', end: '' });

  const totalUsers = ref(0);
  const totalWeight = ref(0); 
  const totalLifetimePoints = ref(0);
  const totalMachines = ref(0);
  const machineLocations = ref<any[]>([]);
  const onlineCount = ref(0);
  const offlineCount = ref(0);
  const recentSubmissions = ref<any[]>([]);

  const summary = ref({
    deliveryVolume: 0,
    submissions: 0,
    newUsers: 0,
    pointsGiven: 0
  });
  
  const wasteTrends = ref<any[]>([]);
  const withdrawalTrends = ref<any[]>([]);
  const collectionLogs = ref<any[]>([]);

  // --- A. INITIAL FETCH ---
  // FIX: Add 'background' param to prevent full-page loading on refresh
  async function fetchInitialData(background = false) {
    const auth = useAuthStore();
    
    // Only show spinner if this is NOT a background refresh
    if (!background) {
      loading.value = true;
    }

    try {
      // 1. MACHINES
      const { data: machines } = await supabase.from('machines').select('*');
      if (machines) {
        const statusPromises = machines.map(async (m) => {
            let isOnline = false;
            try {
                const res = await getMachineConfig(m.device_no);
                if (res && res.code === 200) isOnline = true;
            } catch (e) { /* ignore */ }
            
            if (!isOnline) {
                isOnline = m.is_online === true || m.isOnline === true || String(m.status).toUpperCase() === 'ONLINE';
            }
            return { ...m, isOnline };
        });

        const results = await Promise.all(statusPromises);
        machineLocations.value = results;
        totalMachines.value = results.length;
        onlineCount.value = results.filter(m => m.isOnline).length;
        offlineCount.value = totalMachines.value - onlineCount.value;
      }

      // 2. TOTAL USERS
      const { count: uCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
      totalUsers.value = uCount || 0;

      // 3. TOTAL WEIGHT (RPC)
      const { data: weightSum, error: rpcError } = await supabase.rpc('get_total_weight', { merchant_uuid: auth.merchantId || null });
      if (!rpcError && weightSum !== null) {
        totalWeight.value = Number(weightSum);
      } else {
        // Fallback
        let qWeight = supabase.from('submission_reviews')
          .select('api_weight')
          .range(0, 19999);
        if (auth.merchantId) qWeight = qWeight.eq('merchant_id', auth.merchantId);
        const { data: wData } = await qWeight;
        if (wData) totalWeight.value = wData.reduce((sum, r) => sum + (Number(r.api_weight) || 0), 0);
      }

      // 2. Add TOTAL LIFETIME POINTS (Right after Weight)
      const { data: pointSum, error: ptRpcError } = await supabase.rpc('get_total_points', { merchant_uuid: auth.merchantId || null });
      if (!ptRpcError && pointSum !== null) {
        totalLifetimePoints.value = Number(pointSum);
      } else {
        // Fallback: Sum calculated_value from recent history
        let qPoints = supabase.from('submission_reviews')
          .select('calculated_value')
          .range(0, 19999);
        if (auth.merchantId) qPoints = qPoints.eq('merchant_id', auth.merchantId);
        const { data: pData } = await qPoints;
        if (pData) totalLifetimePoints.value = pData.reduce((sum, r) => sum + (Number(r.calculated_value) || 0), 0);
      }

      // 4. LIVE FEED
      let qFeed = supabase.from('submission_reviews')
        .select('*, users(nickname)')
        .order('submitted_at', { ascending: false, nullsFirst: false }) 
        .limit(20);
        
      if (auth.merchantId) qFeed = qFeed.eq('merchant_id', auth.merchantId);
      
      const { data: feed } = await qFeed;
      if (feed) recentSubmissions.value = feed;

    } catch (err) {
      console.error("Init Error:", err);
    } finally {
      await fetchFilteredStats();
      loading.value = false;
    }
  }

  // --- B. FILTERED STATS FETCH ---
  async function fetchFilteredStats() {
    const auth = useAuthStore();
    statsLoading.value = true;

    try {
      let startDateStr = '';

      // 1. Date Logic
      if (dateRange.value.start) {
        startDateStr = new Date(dateRange.value.start).toISOString();
      } else {
        const d = new Date();
        if (timeFilter.value === 'day') {
            d.setDate(d.getDate() - 1);
            startDateStr = d.toISOString();
        } else if (timeFilter.value === 'week') {
            d.setDate(d.getDate() - 7);
            startDateStr = d.toISOString();
        } else if (timeFilter.value === 'month') {
            d.setMonth(d.getMonth() - 1);
            startDateStr = d.toISOString();
        } else if (timeFilter.value === 'all') {
            // ✅ FIX 1: "All" now means truly ALL time (empty string = no filter)
            startDateStr = ''; 
        }
      }

      // 2. FETCH SUMMARY (RPC)
      const { data: rpcStats } = await supabase.rpc('get_filtered_stats', {
        merchant_uuid: auth.merchantId || null,
        filter_date: startDateStr || null
      });

      if (rpcStats) {
        summary.value.deliveryVolume = Number(rpcStats.deliveryVolume) || 0;
        summary.value.submissions = Number(rpcStats.submissions) || 0;
        summary.value.pointsGiven = Number(rpcStats.pointsGiven) || 0;
      }

      // 3. WASTE TRENDS (Submissions + Collections)
      const wasteMap = new Map();

      // A. Submissions (Delivery)
      let qSubs = supabase.from('submission_reviews')
        .select('api_weight, submitted_at');
      if (startDateStr) qSubs = qSubs.gte('submitted_at', startDateStr);
      if (auth.merchantId) qSubs = qSubs.eq('merchant_id', auth.merchantId);
      
      const { data: subsData } = await qSubs;
      if (subsData) {
        subsData.forEach((r: any) => {
           const day = r.submitted_at.split('T')[0];
           if (!wasteMap.has(day)) wasteMap.set(day, { date: day, delivery_weight: 0, delivery_count: 0, collection_weight: 0, collection_count: 0 });
           const entry = wasteMap.get(day);
           entry.delivery_weight += Number(r.api_weight) || 0;
           entry.delivery_count += 1;
        });
      }

      // B. Cleaning (Collection)
      let qClean = supabase.from('cleaning_records')
        .select('bag_weight_collected, cleaned_at');
      if (startDateStr) qClean = qClean.gte('cleaned_at', startDateStr);
      if (auth.merchantId) qClean = qClean.eq('merchant_id', auth.merchantId);

      const { data: cleanData } = await qClean;
      if (cleanData) {
        cleanData.forEach((r: any) => {
           const day = r.cleaned_at ? r.cleaned_at.split('T')[0] : 'Unknown';
           if (day === 'Unknown') return;
           if (!wasteMap.has(day)) wasteMap.set(day, { date: day, delivery_weight: 0, delivery_count: 0, collection_weight: 0, collection_count: 0 });
           const entry = wasteMap.get(day);
           entry.collection_weight += Number(r.bag_weight_collected) || 0;
           entry.collection_count += 1;
        });
      }
      
      wasteTrends.value = Array.from(wasteMap.values()).sort((a: any, b: any) => a.date.localeCompare(b.date));


      // 4. WITHDRAWAL TRENDS
      let qWith = supabase.from('withdrawals')
        .select('amount, status, created_at');
      if (startDateStr) qWith = qWith.gte('created_at', startDateStr);
      if (auth.merchantId) qWith = qWith.eq('merchant_id', auth.merchantId);

      const { data: wData } = await qWith;
      if (wData) {
        const withMap = new Map();
        wData.forEach((w: any) => {
             const day = w.created_at.split('T')[0];
             if (!withMap.has(day)) withMap.set(day, { 
                 date: day, 
                 request_amount: 0, 
                 approved_amount: 0, 
                 paid_amount: 0,
                 applicants: 0 
             });
             
             const entry = withMap.get(day);
             const amt = Number(w.amount) || 0;
             
             entry.request_amount += amt;
             entry.applicants += 1;
             
             const status = (w.status || '').toUpperCase();
             if (status === 'APPROVED' || status === 'PAID') {
                 entry.approved_amount += amt;
             }
             if (status === 'PAID') {
                 entry.paid_amount += amt;
             }
        });
        withdrawalTrends.value = Array.from(withMap.values()).sort((a: any, b: any) => a.date.localeCompare(b.date));
      }

      // 5. FETCH NEW USERS (✅ FIX 2: Restored this logic)
      let qNewUsers = supabase.from('users').select('*', { count: 'exact', head: true });
      if (startDateStr) qNewUsers = qNewUsers.gte('created_at', startDateStr);
      const { count } = await qNewUsers;
      summary.value.newUsers = count || 0;
      
      // 6. FETCH COLLECTION LOGS (✅ FIX 3: Restored this logic)
      let qCollections = supabase.from('cleaning_records').select('*').order('cleaned_at', { ascending: false });
      if (startDateStr) qCollections = qCollections.gte('cleaned_at', startDateStr);
      // Optional: Filter by merchant if your cleaning table has merchant_id
      if (auth.merchantId) qCollections = qCollections.eq('merchant_id', auth.merchantId);
      
      const { data: cData } = await qCollections;
      if (cData) collectionLogs.value = cData;

    } catch (e) {
      console.error(e);
    } finally {
      statsLoading.value = false;
    }
  }
  
  return {
    loading,
    statsLoading,
    timeFilter,
    dateRange,
    totalUsers,
    totalWeight,
    totalLifetimePoints,
    totalMachines,
    summary,
    machineLocations,
    onlineCount,
    offlineCount,
    wasteTrends,
    withdrawalTrends,
    recentSubmissions,
    collectionLogs,
    fetchInitialData,
    fetchFilteredStats
  };
}