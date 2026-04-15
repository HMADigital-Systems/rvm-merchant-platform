<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAdminLeaderboard } from '../composables/useAdminLeaderboard';
import { useAuthStore } from '../stores/auth';
import { 
  Trophy, Users, Scale, Coins, Calendar,
  RefreshCw, Download, Eye, History,
  AlertTriangle, CheckCircle, ChevronRight
} from 'lucide-vue-next';

const authStore = useAuthStore();

const isSuperAdmin = computed(() => authStore.role === 'SUPER_ADMIN');

const {
  loading,
  leaderboard,
  monthlyHistory,
  fetchLeaderboard,
  fetchMonthlyHistory,
  resetLeaderboard,
  getUserTransactions
} = useAdminLeaderboard();

const activeTab = ref<'leaderboard' | 'history' | 'audit'>('leaderboard');

const selectedUser = ref<string | null>(null);
const userTransactions = ref<any[]>([]);
const showTransactionModal = ref(false);
const showResetConfirm = ref(false);

const fetchUserTransactions = async (userId: string) => {
  selectedUser.value = userId;
  userTransactions.value = await getUserTransactions(userId);
  showTransactionModal.value = true;
};

const closeTransactionModal = () => {
  showTransactionModal.value = false;
  selectedUser.value = null;
  userTransactions.value = [];
};

const handleResetLeaderboard = async () => {
  await resetLeaderboard();
  showResetConfirm.value = false;
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const formatWeight = (weight: number) => {
  return weight.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

onMounted(() => {
  fetchLeaderboard();
  fetchMonthlyHistory();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <!-- Header -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <span>Dashboard</span>
            <ChevronRight :size="16" />
            <span class="text-gray-900">Admin Leaderboard</span>
          </div>
          <h1 class="text-2xl font-bold text-gray-900">Leaderboard & Audit</h1>
          <p class="text-gray-500 mt-1">Monitor top performers and audit transactions</p>
        </div>
        
        <div v-if="isSuperAdmin" class="flex items-center gap-3">
          <button 
            @click="showResetConfirm = true"
            class="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm"
          >
            <RefreshCw :size="18" />
            Reset Leaderboard
          </button>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
      <nav class="flex gap-8 px-8 py-2">
        <button 
          @click="activeTab = 'leaderboard'"
          :class="[
            'py-5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'leaderboard' 
              ? 'border-emerald-600 text-emerald-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          ]"
        >
          <div class="flex items-center gap-2">
            <Trophy :size="16" />
            Current Leaderboard
          </div>
        </button>
        <button 
          @click="activeTab = 'history'"
          :class="[
            'py-5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'history' 
              ? 'border-emerald-600 text-emerald-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          ]"
        >
          <div class="flex items-center gap-2">
            <History :size="16" />
            Monthly Champions
          </div>
        </button>
      </nav>
    </div>

    <!-- Leaderboard Tab -->
    <div v-if="activeTab === 'leaderboard'" class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div v-if="loading" class="p-12 text-center">
        <RefreshCw class="animate-spin mx-auto text-blue-600" :size="32" />
        <p class="mt-2 text-gray-500">Loading leaderboard...</p>
      </div>

      <div v-else-if="leaderboard.length === 0" class="p-12 text-center">
        <Trophy :size="48" class="mx-auto text-gray-300 mb-4" />
        <p class="text-gray-500">No leaderboard data available</p>
      </div>

      <table v-else class="w-full">
          <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase">Rank</th>
            <th class="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
            <th class="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">ID</th>
            <th class="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Total Weight (kg)</th>
            <th class="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Carbon Saved (kg)</th>
            <th class="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase">Submissions</th>
            <th v-if="isSuperAdmin" class="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="user in leaderboard" :key="user.user_id" class="hover:bg-gray-50">
            <td class="px-6 py-5 text-center">
              <span 
                class="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold"
                :class="{
                  'bg-yellow-100 text-yellow-700': user.rank === 1,
                  'bg-gray-200 text-gray-700': user.rank === 2,
                  'bg-amber-100 text-amber-700': user.rank === 3,
                  'bg-gray-50 text-gray-500': user.rank > 3
                }"
              >
                {{ user.rank }}
              </span>
            </td>
            <td class="px-6 py-5">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                  {{ user.nickname?.charAt(0) || 'U' }}
                </div>
                <div>
                  <p class="font-medium text-gray-900">{{ user.nickname }}</p>
                  <p class="text-sm text-gray-500">{{ user.email }}</p>
                </div>
              </div>
            </td>
            <td class="px-6 py-5 text-gray-500 text-sm">
              {{ user.user_id }}
            </td>
            <td class="px-6 py-5 text-right">
              <span class="font-medium text-gray-900">{{ formatWeight(user.total_weight) }}</span>
            </td>
            <td class="px-6 py-5 text-right">
              <span class="font-medium text-green-600">{{ formatWeight(user.carbon_saved || user.total_weight * 0.5) }}</span>
            </td>
            <td class="px-6 py-5 text-center">
              <span class="text-gray-600">{{ user.submission_count }}</span>
            </td>
            <td v-if="isSuperAdmin" class="px-6 py-5 text-center">
              <button 
                @click="fetchUserTransactions(user.user_id)"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <Eye :size="14" />
                View Transaction History
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Monthly History Tab -->
    <div v-if="activeTab === 'history'" class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div v-if="loading" class="p-12 text-center">
        <RefreshCw class="animate-spin mx-auto text-blue-600" :size="32" />
        <p class="mt-2 text-gray-500">Loading history...</p>
      </div>

      <div v-else-if="monthlyHistory.length === 0" class="p-12 text-center">
        <History :size="48" class="mx-auto text-gray-300 mb-4" />
        <p class="text-gray-500">No monthly champions history</p>
        <p class="text-sm text-gray-400 mt-2">Use "Reset Leaderboard" to archive current winners</p>
      </div>

      <div v-else>
        <div v-for="monthGroup in [...new Set(monthlyHistory.map(h => `${h.month} ${h.year}`))]" :key="monthGroup" class="border-b border-gray-100 last:border-0">
          <div class="px-6 py-3 bg-gray-50 border-b border-gray-100">
            <h3 class="font-semibold text-gray-900">{{ monthGroup }}</h3>
          </div>
          <table class="w-full">
            <tbody class="divide-y divide-gray-100">
              <tr v-for="champion in monthlyHistory.filter(h => `${h.month} ${h.year}` === monthGroup)" :key="champion.id" class="hover:bg-gray-50">
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <span 
                      class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                      :class="{
                        'bg-yellow-100 text-yellow-700': champion.rank === 1,
                        'bg-gray-200 text-gray-700': champion.rank === 2,
                        'bg-amber-100 text-amber-700': champion.rank === 3,
                        'bg-gray-50 text-gray-500': champion.rank > 3
                      }"
                    >
                      {{ champion.rank }}
                    </span>
                    <span class="font-medium text-gray-900">{{ champion.nickname }}</span>
                  </div>
                </td>
                <td class="px-6 py-4 text-right text-gray-600">
                  {{ formatWeight(champion.total_weight) }} kg
                </td>
                <td class="px-6 py-4 text-right text-green-600 font-medium">
                  {{ formatWeight(champion.total_points) }}
                </td>
                <td class="px-6 py-4 text-right text-gray-500 text-sm">
                  {{ formatDate(champion.archived_at) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Transaction Modal -->
    <div v-if="showTransactionModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="closeTransactionModal">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[85vh] overflow-hidden">
        <div class="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Transaction History - Audit Trail</h3>
            <p class="text-sm text-gray-500">User ID: {{ selectedUser }}</p>
          </div>
          <button @click="closeTransactionModal" class="text-gray-400 hover:text-gray-600 p-1">
            <span class="text-2xl">&times;</span>
          </button>
        </div>
        <div class="overflow-auto max-h-[60vh] p-4">
          <table class="w-full">
            <thead class="bg-gray-50 sticky top-0">
              <tr>
                <th class="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Date & Time</th>
                <th class="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Machine</th>
                <th class="px-5 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Weight (kg)</th>
                <th class="px-5 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Points</th>
                <th class="px-5 py-4 text-center text-xs font-semibold text-gray-500 uppercase">Multiplier</th>
                <th class="px-5 py-4 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="trans in userTransactions" :key="trans.id" class="hover:bg-gray-50">
                <td class="px-5 py-4 text-sm text-gray-600">
                  {{ formatDate(trans.created_at) }}
                </td>
                <td class="px-5 py-4 text-sm text-gray-900">
                  {{ trans.device_no || 'N/A' }}
                </td>
                <td class="px-5 py-4 text-sm text-gray-900 text-right font-medium">
                  {{ formatWeight(trans.total_weight) }}
                </td>
                <td class="px-5 py-4 text-sm text-emerald-600 text-right font-medium">
                  {{ trans.calculated_value }}
                </td>
                <td class="px-5 py-4 text-center">
                  <span class="px-2 py-0.5 text-xs font-medium rounded-full"
                    :class="{
                      'bg-purple-100 text-purple-700': trans.multiplier >= 3,
                      'bg-blue-100 text-blue-700': trans.multiplier >= 2 && trans.multiplier < 3,
                      'bg-gray-100 text-gray-700': trans.multiplier < 2
                    }"
                  >
                    {{ trans.multiplier || 1 }}x
                  </span>
                </td>
                <td class="px-5 py-4 text-center">
                  <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
                    {{ trans.status }}
                  </span>
                </td>
              </tr>
              <tr v-if="userTransactions.length === 0">
                <td colspan="6" class="px-5 py-8 text-center text-gray-500">
                  No transactions found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Reset Confirmation Modal -->
    <div v-if="showResetConfirm" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showResetConfirm = false">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <AlertTriangle :size="24" class="text-emerald-600" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Reset Leaderboard?</h3>
            <p class="text-sm text-gray-500">This action archives current top users</p>
          </div>
        </div>
        <p class="text-gray-600 mb-6">
          Are you sure? This will archive the current Top 10 into the Monthly Champions table and clear current scores.
        </p>
        <div class="flex gap-3">
          <button 
            @click="showResetConfirm = false"
            class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            @click="handleResetLeaderboard"
            :disabled="loading"
            class="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {{ loading ? 'Resetting...' : 'Confirm Reset' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>