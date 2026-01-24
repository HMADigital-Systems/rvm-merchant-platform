import { ref } from 'vue';
import { supabase } from '../services/supabase';
import type { Withdrawal, SubmissionReview } from '../types';
import { useAuthStore } from '../stores/auth';

// Define Cleaning Record Type matches your DB relation
interface CleaningRecord {
  id: string;
  device_no: string;
  cleaner_name?: string;
  status: string;
  created_at: string;
  machines?: { device_name: string };
}

export function useDashboardStats() {
  const loading = ref(true);
  const pendingCount = ref(0);
  const totalPoints = ref(0);
  const totalWeight = ref(0);
  
  // ⚡ DATA BUCKETS
  const recentWithdrawals = ref<Withdrawal[]>([]);
  const recentSubmissions = ref<SubmissionReview[]>([]);
  const recentCleaning = ref<CleaningRecord[]>([]);

  async function fetchStats() {
    const auth = useAuthStore();
    loading.value = true;
    
    // Helper to apply merchant filter
    const applyFilter = (query: any) => {
        if (auth.merchantId) return query.eq('merchant_id', auth.merchantId);
        return query;
    };

    try {
      // ---------------------------------------------------------
      // 1. FETCH LISTS (Pending, Recent Activity) - Parallel
      // ---------------------------------------------------------
      
      // A. Pending Withdrawals Count
      let pendingQuery = supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
      
      // B. Recent Activity Lists
      let recWithdrawalsQuery = supabase.from('withdrawals').select('*, users(nickname, phone)').order('created_at', { ascending: false }).limit(5);
      let recSubmissionsQuery = supabase.from('submission_reviews').select('*, users(nickname)').order('submitted_at', { ascending: false }).limit(5);
      let recCleaningQuery = supabase.from('cleaning_records').select('*').order('created_at', { ascending: false }).limit(5);

      // Apply Filters
      pendingQuery = applyFilter(pendingQuery);
      recWithdrawalsQuery = applyFilter(recWithdrawalsQuery);
      recSubmissionsQuery = applyFilter(recSubmissionsQuery);
      recCleaningQuery = applyFilter(recCleaningQuery);

      // Execute Lists in Parallel
      const [pendingRes, recWRes, recSRes, recCRes] = await Promise.all([
        pendingQuery,
        recWithdrawalsQuery,
        recSubmissionsQuery,
        recCleaningQuery
      ]);

      // Process List Results
      if (pendingRes.count !== null) pendingCount.value = pendingRes.count;
      // @ts-ignore
      if (recWRes.data) recentWithdrawals.value = recWRes.data;
      // @ts-ignore
      if (recSRes.data) recentSubmissions.value = recSRes.data;
      // @ts-ignore
      if (recCRes.data) recentCleaning.value = recCRes.data;

      // ---------------------------------------------------------
      // 2. FETCH TOTALS (Optimized RPC Logic from Big Data)
      // ---------------------------------------------------------

      // A. TOTAL WEIGHT (RPC)
      const { data: weightSum, error: rpcError } = await supabase.rpc('get_total_weight', { merchant_uuid: auth.merchantId || null });
      
      if (!rpcError && weightSum !== null) {
        totalWeight.value = Number(weightSum);
      } else {
        // Fallback: Sum manually (limited range)
        let qWeight = supabase.from('submission_reviews')
          .select('api_weight')
          .range(0, 19999);
        
        if (auth.merchantId) qWeight = qWeight.eq('merchant_id', auth.merchantId);
        
        const { data: wData } = await qWeight;
        if (wData) totalWeight.value = wData.reduce((sum, r) => sum + (Number(r.api_weight) || 0), 0);
      }

      // B. TOTAL LIFETIME POINTS (RPC)
      const { data: pointSum, error: ptRpcError } = await supabase.rpc('get_total_points', { merchant_uuid: auth.merchantId || null });
      
      if (!ptRpcError && pointSum !== null) {
        totalPoints.value = Number(pointSum);
      } else {
        // Fallback: Sum manually (limited range)
        let qPoints = supabase.from('submission_reviews')
          .select('calculated_value')
          .range(0, 19999);
          
        if (auth.merchantId) qPoints = qPoints.eq('merchant_id', auth.merchantId);
        
        const { data: pData } = await qPoints;
        if (pData) totalPoints.value = pData.reduce((sum, r) => sum + (Number(r.calculated_value) || 0), 0);
      }

    } catch (err) {
      console.error("Stats Error:", err);
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    pendingCount,
    totalPoints,
    totalWeight,
    recentWithdrawals,
    recentSubmissions,
    recentCleaning,
    fetchStats
  };
}