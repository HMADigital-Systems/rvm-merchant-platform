<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabaseService, hardwareApiService } from '../services/api';
import type { Withdrawal } from '../types'; // Fix: type-only
import { WithdrawalStatus } from '../types'; 
import { 
  CheckCircle2, 
  XCircle, 
  RefreshCcw, 
  AlertTriangle,
  ArrowUpRight,
  Database,
  CloudLightning
} from 'lucide-vue-next';

interface BalanceCheckResult {
  id: string;
  available: number;
  lifetime: number;
  spent: number;
}

const withdrawals = ref<Withdrawal[]>([]);
const checkingBalanceId = ref<string | null>(null);
const balanceResult = ref<BalanceCheckResult | null>(null);

const loadWithdrawals = async () => {
  try {
    const data = await supabaseService.getWithdrawals();
    withdrawals.value = data.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } catch (error) {
    console.error("Failed to load withdrawals", error);
  }
};

const handleStatusChange = async (id: string, newStatus: WithdrawalStatus) => {
  try {
    await supabaseService.updateWithdrawalStatus(id, newStatus);
    if (balanceResult.value?.id === id) {
      balanceResult.value = null;
    }
    await loadWithdrawals();
  } catch (error) {
    console.error("Failed to update status", error);
  }
};

const handleCheckBalance = async (withdrawal: Withdrawal) => {
  checkingBalanceId.value = withdrawal.id;
  balanceResult.value = null;

  try {
    const apiResponse = await hardwareApiService.syncUserAccount(withdrawal.phone);
    const apiLifetimePoints = apiResponse.data.integral;
    const userHistory = await supabaseService.getUserWithdrawalHistory(withdrawal.user_id);

    const totalSpentOrReserved = userHistory
      .filter((w: Withdrawal) => w.status !== WithdrawalStatus.REJECTED)
      .reduce((sum: number, w: Withdrawal) => sum + w.amount, 0);

    const available = apiLifetimePoints - totalSpentOrReserved;

    balanceResult.value = {
      id: withdrawal.id,
      available,
      lifetime: apiLifetimePoints,
      spent: totalSpentOrReserved
    };
  } catch (error: any) {
    alert(`Failed to sync with hardware API: ${error.message || "Unknown error"}`);
    console.error(error);
  } finally {
    checkingBalanceId.value = null;
  }
};

const getStatusConfig = (status: WithdrawalStatus) => {
  switch (status) {
    case WithdrawalStatus.APPROVED:
      return { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2 };
    case WithdrawalStatus.REJECTED:
      return { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle };
    case WithdrawalStatus.PENDING:
      return { bg: 'bg-amber-100', text: 'text-amber-700', icon: AlertTriangle };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-700', icon: AlertTriangle };
  }
};

onMounted(() => {
  loadWithdrawals();
});
</script>

<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
    <div class="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
      <div>
        <h2 class="text-lg font-bold text-gray-900">Withdrawal Requests</h2>
        <p class="text-sm text-gray-500 mt-1">Manage point redemption requests</p>
      </div>
      <button 
        @click="loadWithdrawals" 
        class="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:shadow transition-all"
      >
        <RefreshCcw :size="14" />
        <span>Refresh</span>
      </button>
    </div>
    
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold tracking-wider">
          <tr>
            <th class="px-8 py-4">Request Info</th>
            <th class="px-8 py-4">User Details</th>
            <th class="px-8 py-4">Amount</th>
            <th class="px-8 py-4">Status</th>
            <th class="px-8 py-4 w-72">Live Balance Check</th>
            <th class="px-8 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="w in withdrawals" :key="w.id" class="hover:bg-gray-50/80 transition-colors group">
            <td class="px-8 py-5">
              <div class="text-sm font-medium text-gray-900">
                {{ new Date(w.created_at).toLocaleDateString() }}
              </div>
              <div class="text-xs text-gray-400 mt-0.5">
                {{ new Date(w.created_at).toLocaleTimeString() }}
              </div>
            </td>
            <td class="px-8 py-5">
              <div class="text-sm font-medium text-gray-900">{{ w.phone }}</div>
              <div class="text-xs text-gray-400 font-mono mt-0.5">ID: {{ w.user_id }}</div>
            </td>
            <td class="px-8 py-5">
              <div class="flex items-center text-sm font-bold text-gray-900">
                {{ w.amount }}
                <span class="text-gray-400 font-normal ml-1">pts</span>
              </div>
            </td>
            <td class="px-8 py-5">
              <span :class="`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusConfig(w.status).bg} ${getStatusConfig(w.status).text}`">
                <component :is="getStatusConfig(w.status).icon" :size="12" class="mr-1.5" />
                {{ w.status }}
              </span>
            </td>
            <td class="px-8 py-5">
              <div v-if="balanceResult && balanceResult.id === w.id" class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs w-full shadow-sm">
                <div class="flex justify-between items-center mb-2 pb-2 border-b border-slate-100">
                  <span class="text-slate-500 font-medium">Available</span>
                  <span :class="`font-bold text-sm ${balanceResult.available < w.amount ? 'text-red-600' : 'text-green-600'}`">
                    {{ balanceResult.available }}
                  </span>
                </div>
                <div class="space-y-1 text-slate-400">
                  <div class="flex items-center justify-between">
                    <span class="flex items-center"><CloudLightning :size="10" class="mr-1"/> API Life</span>
                    <span>{{ balanceResult.lifetime }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="flex items-center"><Database :size="10" class="mr-1"/> DB Used</span>
                    <span>{{ balanceResult.spent }}</span>
                  </div>
                </div>
              </div>
              <button
                v-else
                @click="handleCheckBalance(w)"
                :disabled="checkingBalanceId === w.id"
                class="group/btn flex items-center justify-center space-x-2 w-full py-2 px-3 bg-white border border-blue-200 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-50 hover:border-blue-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCcw :size="12" :class="`transition-transform ${checkingBalanceId === w.id ? 'animate-spin' : 'group-hover/btn:rotate-180'}`" />
                <span>{{ checkingBalanceId === w.id ? 'Verifying...' : 'Check API Balance' }}</span>
              </button>
            </td>
            <td class="px-8 py-5 text-right">
              <div v-if="w.status === WithdrawalStatus.PENDING" class="flex justify-end space-x-2">
                <button
                  @click="handleStatusChange(w.id, WithdrawalStatus.APPROVED)"
                  class="flex items-center justify-center p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 transition-colors"
                  title="Approve"
                >
                  <CheckCircle2 :size="16" />
                </button>
                <button
                  @click="handleStatusChange(w.id, WithdrawalStatus.REJECTED)"
                  class="flex items-center justify-center p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
                  title="Reject"
                >
                  <XCircle :size="16" />
                </button>
              </div>
              <div v-else class="flex items-center justify-end text-gray-400">
                 <span class="text-xs font-medium mr-1">Processed</span>
                 <ArrowUpRight :size="12" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>