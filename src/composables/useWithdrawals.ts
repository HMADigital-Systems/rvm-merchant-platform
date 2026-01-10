import { ref } from 'vue';
import { supabase } from '../services/supabase';
//import { syncUserAccount } from '../services/autogcm';
import { WithdrawalStatus, type Withdrawal } from '../types';
import { useAuthStore } from '../stores/auth';

interface WithdrawalWithBundle extends Withdrawal {
  total_amount?: number;
  bundled_ids?: string[];
  sub_withdrawals?: any[];
  is_bundled?: boolean;
}

interface BalanceCheckResult {
  id: string;
  available: number;
  lifetime: number;
  spent: number;
}

export function useWithdrawals() {
  const withdrawals = ref<WithdrawalWithBundle[]>([]);
  const loading = ref(false);
  
  // Balance Check State
  const checkingBalanceId = ref<string | null>(null);
  const balanceResult = ref<BalanceCheckResult | null>(null);

  // 1. Fetch Data
  const fetchWithdrawals = async () => {
    const auth = useAuthStore();
    loading.value = true;
    try {
      let query = supabase
        .from('withdrawals')
        .select(`
            *,
            users ( nickname, phone, avatar_url ),
            merchants!merchant_id ( name ) 
        `)
        .order('created_at', { ascending: false });

      // 🔥 SaaS Filter
      if (auth.merchantId) {
          query = query.eq('merchant_id', auth.merchantId);
      }

      const { data, error } = await query;
      console.log("🔥 Raw Data from Supabase:", data);

      if (error) throw error;
     if (!auth.merchantId && data) {
        // SUPER ADMIN: Bundle split records
        const groups = new Map<string, WithdrawalWithBundle>();

        data.forEach((item: any) => {
          // Group by User + Exact Time + Status
          const timeKey = new Date(item.created_at).toISOString().split('.')[0]; 
          const key = `${item.user_id}_${timeKey}_${item.status}`;

          if (!groups.has(key)) {
            // 👇 FIX: Explicitly cast 'item' to allow adding new properties
            const newItem: WithdrawalWithBundle = {
              ...item,
              is_bundled: false,
              total_amount: Number(item.amount),
              bundled_ids: [item.id],
              sub_withdrawals: [item]
            };
            groups.set(key, newItem);
          } else {
            const group = groups.get(key)!;
            group.is_bundled = true;
            group.total_amount = (group.total_amount || 0) + Number(item.amount);
            group.bundled_ids?.push(item.id);
            group.sub_withdrawals?.push(item);
            
            // 👇 FIX: Ensure type compatibility. 
            // If 'amount' in your types.ts is number, cast it. If string, keeps as string.
            // Assuming amount is string based on toFixed(2) usage:
            group.amount = group.total_amount?.toFixed(2) as any; 
          }
        });
        withdrawals.value = Array.from(groups.values());
      } else {
        // MERCHANTS: See raw data
        withdrawals.value = data as WithdrawalWithBundle[];
      }
    } catch (error) {
      console.error("Failed to load withdrawals", error);
    } finally {
      loading.value = false;
    }
  };

  // 2. Update Status
  const updateStatus = async (id: string, newStatus: WithdrawalStatus) => {
    if (!confirm(`Mark this request as ${newStatus}?`)) return;

    try {
      // 👇 3. REPLACE THE UPDATE LOGIC HERE:
      // Find bundle to update ALL sub-transactions at once
      const target = withdrawals.value.find(w => w.id === id);
      const idsToUpdate = target?.bundled_ids || [id];

      const { error } = await supabase
        .from('withdrawals')
        .update({ status: newStatus })
        .in('id', idsToUpdate);

      if (error) throw error;

      // Clear balance check if it was for this item
      if (balanceResult.value?.id === id) {
        balanceResult.value = null;
      }
      await fetchWithdrawals(); // Refresh list
    } catch (error) {
      alert("Failed to update status");
      console.error(error);
    }
  };

  // 3. Hybrid Balance Check
  const checkBalance = async (withdrawal: WithdrawalWithBundle) => {
    const auth = useAuthStore();
    const userId = withdrawal.user_id;

    checkingBalanceId.value = withdrawal.id;
    balanceResult.value = null;

    try {
      // 1. Define the scope (Specific Merchant vs Global)
      const targetMerchantId = auth.merchantId || withdrawal.merchant_id;

      // 2. Fetch Total Earnings from THIS Merchant (Source of Truth)
      // We look at submission_reviews to see how much recycling they did here.
      let earningsQuery = supabase
        .from('submission_reviews')
        .select('machine_given_points')
        .eq('user_id', userId)
        .neq('status', 'REJECTED'); // Valid recycles only

      if (targetMerchantId) {
        earningsQuery = earningsQuery.eq('merchant_id', targetMerchantId);
      }

      const { data: earningsData } = await earningsQuery;
      const totalEarned = (earningsData || []).reduce((sum, r) => sum + Number(r.machine_given_points || 0), 0);

      // 3. Fetch Total Withdrawals from THIS Merchant
      let withdrawalsQuery = supabase
        .from('withdrawals')
        .select('amount')
        .eq('user_id', userId)
        .neq('status', 'REJECTED'); // Valid withdrawals only

      if (targetMerchantId) {
        withdrawalsQuery = withdrawalsQuery.eq('merchant_id', targetMerchantId);
      }

      const { data: withdrawalsData } = await withdrawalsQuery;
      const totalWithdrawn = (withdrawalsData || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

      // 4. Calculate Available Balance for THIS Merchant
      const availableBalance = totalEarned - totalWithdrawn;

      balanceResult.value = {
        id: withdrawal.id,
        available: Number(availableBalance.toFixed(2)), 
        lifetime: Number(totalEarned.toFixed(2)),
        spent: Number(totalWithdrawn.toFixed(2))
      };

    } catch (error: any) {
      alert(`Audit Error: ${error.message || "Unknown"}`);
      console.error(error);
    } finally {
      checkingBalanceId.value = null;
    }
  };

  return {
    withdrawals,
    loading,
    checkingBalanceId,
    balanceResult,
    fetchWithdrawals,
    updateStatus,
    checkBalance
  };
}