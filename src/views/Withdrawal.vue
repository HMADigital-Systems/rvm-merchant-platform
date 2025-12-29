<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useWithdrawals } from '../composables/useWithdrawals'; 
import WithdrawalFilters from '../components/WithdrawalFilters.vue'; 
import { WithdrawalStatus } from '../types'; 
import { 
  CheckCircle2, XCircle, RefreshCcw, AlertTriangle,  ChevronLeft, ChevronRight
} from 'lucide-vue-next';
import { Eye } from 'lucide-vue-next';
import type { Withdrawal } from '../types';
import WithdrawalDetailsModal from '../components/WithdrawalDetailsModal.vue';

// 1. Init Logic from Composable
const { 
  withdrawals, 
  loading, 
  checkingBalanceId, 
  balanceResult, 
  fetchWithdrawals, 
  updateStatus, 
  checkBalance 
} = useWithdrawals();

// 2. Filter State (Updated to include dates)
const searchFilters = ref({ 
  search: '', 
  status: '', 
  startDate: '', 
  endDate: '' 
});

// 3. Filter Logic (Computed)
const filteredList = computed(() => {
  return withdrawals.value.filter(w => {
    // A. Status Check
    if (searchFilters.value.status && w.status !== searchFilters.value.status) return false;
    
    // B. Date Range Check (✅ New)
    if (searchFilters.value.startDate || searchFilters.value.endDate) {
       const date = w.created_at.split('T')[0] || '';
       if (searchFilters.value.startDate && date < searchFilters.value.startDate) return false;
       if (searchFilters.value.endDate && date > searchFilters.value.endDate) return false;
    }

    // C. Enhanced Text Search (User + Bank Details)
    const q = searchFilters.value.search.toLowerCase();
    if (q) {
      // User Details
      const phone = (w.users?.phone || '').toLowerCase();
      const name = (w.users?.nickname || '').toLowerCase();
      const userId = w.user_id.toLowerCase();
      
      // Payment Details (✅ New)
      const bank = (w.bank_name || '').toLowerCase();
      const acctNo = (w.account_number || '').toLowerCase();
      const holder = (w.account_holder_name || '').toLowerCase();
      
      // If NONE match, hide the row
      if (
        !phone.includes(q) && 
        !name.includes(q) && 
        !userId.includes(q) &&
        !bank.includes(q) &&
        !acctNo.includes(q) &&
        !holder.includes(q)
      ) return false;
    }

    return true;
  });
});

// 4. Pagination Logic 📄
const currentPage = ref(1);
const itemsPerPage = ref(10);
const totalPages = computed(() => Math.ceil(filteredList.value.length / itemsPerPage.value));

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return filteredList.value.slice(start, start + itemsPerPage.value);
});

// Reset page on filter change
watch(filteredList, () => currentPage.value = 1);

// Helpers
const getStatusConfig = (status: WithdrawalStatus) => {
  switch (status) {
    case WithdrawalStatus.APPROVED: return { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2 };
    case WithdrawalStatus.REJECTED: return { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle };
    case WithdrawalStatus.PENDING: return { bg: 'bg-amber-100', text: 'text-amber-700', icon: AlertTriangle };
    default: return { bg: 'bg-gray-100', text: 'text-gray-700', icon: AlertTriangle };
  }
};

const showModal = ref(false);
const selectedWithdrawal = ref<Withdrawal | null>(null);

const openDetails = (w: Withdrawal) => {
  selectedWithdrawal.value = w;
  showModal.value = true;
};

onMounted(() => fetchWithdrawals());
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
      <div>
        <h2 class="text-lg font-bold text-gray-900">Withdrawal Requests</h2>
        <p class="text-sm text-gray-500 mt-1">Manage point redemption requests</p>
      </div>
      <button 
        @click="fetchWithdrawals" 
        :disabled="loading"
        class="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50"
      >
        <RefreshCcw :size="14" :class="{'animate-spin': loading}" />
        <span>{{ loading ? 'Loading...' : 'Refresh' }}</span>
      </button>
    </div>

    <WithdrawalFilters @update:filters="(val) => searchFilters = val" />

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold tracking-wider whitespace-nowrap sticky top-0 z-5 shadow-sm">
            <tr>
              <th class="px-6 py-4 border-b bg-gray-50 sticky left-0 z-6 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">Date</th>
              
              <th class="px-6 py-4 border-b">User</th>
              <th class="px-6 py-4 border-b">Phone</th>
              <th class="px-6 py-4 border-b text-right">Amount</th>
              <th class="px-6 py-4 border-b text-center">Status</th>
              <th class="px-6 py-4 border-b w-48">Balance Check</th>
              
              <th class="px-6 py-4 border-b text-right bg-gray-50 sticky right-0 z-6 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">Actions</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-gray-100 text-sm">
            <tr v-if="paginatedList.length === 0">
              <td colspan="7" class="p-8 text-center text-gray-400">No requests found.</td>
            </tr>

            <tr v-for="w in paginatedList" :key="w.id" class="hover:bg-gray-50/80 transition-colors group">
              
              <td class="px-6 py-4 whitespace-nowrap text-gray-500 text-xs sticky left-0 bg-white group-hover:bg-gray-50 transition-colors z-3 border-r border-gray-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                <div>{{ new Date(w.created_at).toLocaleDateString() }}</div>
                <div class="mt-0.5">{{ new Date(w.created_at).toLocaleTimeString() }}</div>
              </td>

              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                  <div class="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mr-2 overflow-hidden shrink-0">
                    <img v-if="w.users?.avatar_url" :src="w.users.avatar_url" class="h-full w-full object-cover" />
                    <span v-else class="text-xs">👤</span>
                  </div>
                  <span class="font-medium text-gray-900">{{ w.users?.nickname || 'Guest' }}</span>
                </div>
              </td>

              <td class="px-6 py-4 whitespace-nowrap font-mono text-xs text-gray-600">
                {{ w.users?.phone || '-' }}
              </td>

              <td class="px-6 py-4 whitespace-nowrap text-right font-bold text-gray-900">
                {{ w.amount }} pts
              </td>

              <td class="px-6 py-4 whitespace-nowrap text-center">
                <span :class="`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusConfig(w.status).bg} ${getStatusConfig(w.status).text} border-opacity-20`">
                  <component :is="getStatusConfig(w.status).icon" :size="12" class="mr-1.5" />
                  {{ w.status }}
                </span>
              </td>

              <td class="px-6 py-4">
                 <div v-if="balanceResult && balanceResult.id === w.id" class="bg-slate-50 border border-slate-200 rounded p-2 text-xs w-40 shadow-sm">
                   <div class="flex justify-between font-bold mb-1 border-b border-slate-200 pb-1">
                     <span class="text-slate-600">Current:</span>
                     <span :class="balanceResult.available < w.amount ? 'text-red-600' : 'text-green-600'">
                       {{ balanceResult.available.toFixed(2) }}
                     </span>
                   </div>
                   <div class="space-y-0.5 text-[10px] text-slate-500">
                     <div class="flex justify-between"><span>Used:</span><span>{{ balanceResult.spent.toFixed(2) }}</span></div>
                     <div class="flex justify-between"><span>Life:</span><span>{{ balanceResult.lifetime.toFixed(2) }}</span></div>
                   </div>
                 </div>
                 <button v-else @click="checkBalance(w)" :disabled="checkingBalanceId === w.id" class="w-full py-1.5 px-3 bg-white border border-blue-200 text-blue-600 rounded text-xs font-medium hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                   <RefreshCcw :size="12" :class="{'animate-spin': checkingBalanceId === w.id}" />
                   {{ checkingBalanceId === w.id ? '...' : 'Verify' }}
                 </button>
              </td>

              <td class="px-6 py-4 whitespace-nowrap text-right sticky right-0 bg-white group-hover:bg-gray-50 transition-colors z-3 border-l border-gray-100 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                <div class="flex justify-end gap-2">
                  <button @click="openDetails(w)" class="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200" title="View Details">
                    <Eye :size="16" />
                  </button>

                  <template v-if="w.status === WithdrawalStatus.PENDING">
                    <button @click="updateStatus(w.id, WithdrawalStatus.APPROVED)" class="p-1.5 rounded bg-green-50 text-green-600 hover:bg-green-100 border border-green-200" title="Approve">
                      <CheckCircle2 :size="16" />
                    </button>
                    <button @click="updateStatus(w.id, WithdrawalStatus.REJECTED)" class="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200" title="Reject">
                      <XCircle :size="16" />
                    </button>
                  </template>
                </div>
              </td>

            </tr>
          </tbody>
        </table>
        <div class="bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
          <span class="text-sm text-gray-500">
            Showing <span class="font-medium text-gray-900">{{ (currentPage - 1) * itemsPerPage + 1 }}</span>
            to <span class="font-medium text-gray-900">{{ Math.min(currentPage * itemsPerPage, filteredList.length) }}</span>
            of <span class="font-medium text-gray-900">{{ filteredList.length }}</span> results
          </span>
          <div class="flex items-center gap-4">
            <select v-model="itemsPerPage" class="text-sm border-gray-300 rounded-lg bg-white py-1">
              <option :value="5">5</option>
              <option :value="10">10</option>
              <option :value="20">20</option>
            </select>
            <div class="flex items-center bg-white rounded-lg border border-gray-300 overflow-hidden">
              <button @click="currentPage--" :disabled="currentPage === 1" class="px-3 py-1 hover:bg-gray-50 disabled:opacity-50 border-r">
                <ChevronLeft :size="16" />
              </button>
              <span class="px-4 py-1 text-sm font-medium text-gray-700">Page {{ currentPage }}</span>
              <button @click="currentPage++" :disabled="currentPage >= totalPages" class="px-3 py-1 hover:bg-gray-50 disabled:opacity-50">
                <ChevronRight :size="16" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <WithdrawalDetailsModal 
      :isOpen="showModal" 
      :withdrawal="selectedWithdrawal" 
      @close="showModal = false" 
    />
  </div>
</template>