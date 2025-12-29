<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../services/supabase';
import { useMachineStore } from '../stores/machines';
import { storeToRefs } from 'pinia';
import { AlertCircle, Server, Coins, Activity } from 'lucide-vue-next';
import StatsCard from '../components/StatsCard.vue'; // ✅ Import your component

// Setup Store
const machineStore = useMachineStore();
const { machines, loading: machineLoading } = storeToRefs(machineStore);

const pendingCount = ref<number>(0);
const totalPoints = ref<number>(0);
const dashboardLoading = ref<boolean>(true);

// Computed Property for Online Count
const onlineMachinesCount = computed(() => {
  return machines.value.filter((m) => m.isOnline).length;
});

onMounted(async () => {
  try {
    // 1. Trigger Machine Store (Parallel Load)
    machineStore.fetchMachines();

    // 2. Get Pending Withdrawals Count
    const { count, error } = await supabase
      .from('withdrawals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PENDING');
    
    if (!error && count !== null) {
      pendingCount.value = count;
    }

    // 3. 🔥 FIX: Calculate True Lifetime Points
    // Formula: (Current Live Balance) + (All Points Ever Withdrawn/Pending)
    
    // A. Fetch Current "Live" Points from all users
    const { data: usersData, error: userError } = await supabase
      .from('users')
      .select('lifetime_integral');

    // B. Fetch ALL withdrawals that represent points leaving the wallet
    // We exclude 'REJECTED' because those points are usually refunded to the user.
    const { data: withdrawnData, error: withdrawError } = await supabase
      .from('withdrawals')
      .select('amount')
      .neq('status', 'REJECTED'); // ✅ Count PENDING, APPROVED, PAID, EXTERNAL_SYNC

    if (!userError && !withdrawError) {
      // Sum 1: What users currently have
      const currentLiveSum = usersData?.reduce((sum, user) => sum + Number(user.lifetime_integral || 0), 0) || 0;

      // Sum 2: What users have already spent/requested
      const withdrawnSum = withdrawnData?.reduce((sum, w) => sum + Number(w.amount || 0), 0) || 0;

      // Final Total: The true history of all points generated
      totalPoints.value = currentLiveSum + withdrawnSum;
    }

  } catch (err) {
    console.error("Dashboard Data Error:", err);
  } finally {
    dashboardLoading.value = false;
  }
});

const formatNumber = (num: number) => num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
</script>

<template>
  <div class="space-y-8 p-6">
    <div v-if="dashboardLoading && machines.length === 0" class="flex h-64 items-center justify-center">
      <div class="text-gray-400 animate-pulse font-medium">Loading Analytics...</div>
    </div>

    <div v-else>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        <StatsCard 
          title="Pending Withdrawals" 
          :value="pendingCount" 
          color="amber" 
          description="Action Required"
        >
          <template #icon>
            <AlertCircle :size="24" />
          </template>
        </StatsCard>

        <StatsCard 
          title="Online Machines" 
          :value="machineLoading ? 'Syncing...' : onlineMachinesCount" 
          color="green" 
          description="Active RVM Units"
        >
          <template #icon>
            <Server :size="24" />
          </template>
        </StatsCard>

        <StatsCard 
          title="Total Points Earned" 
          :value="formatNumber(totalPoints)" 
          color="blue" 
          description="Lifetime Distribution"
        >
          <template #icon>
            <Coins :size="24" />
          </template>
        </StatsCard>

      </div>

      <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div class="flex items-center space-x-3 mb-6">
          <Activity class="text-green-600" :size="20" />
          <h3 class="text-lg font-bold text-gray-900">System Health Status</h3>
        </div>
        
        <div class="flex items-center space-x-3 text-sm font-medium text-green-700 bg-green-50 px-4 py-3 rounded-lg border border-green-100 w-fit">
          <span class="relative flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span>External Hardware API Proxy is reachable</span>
        </div>
      </div>
    </div>
  </div>
</template>