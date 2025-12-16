<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { supabaseService, hardwareApiService } from '../services/api';
import type { User, ApiDisposalRecord, Withdrawal } from '../types'; // Type-only

const route = useRoute();
const user = ref<User | null>(null);
const disposalHistory = ref<ApiDisposalRecord[]>([]);
const withdrawalHistory = ref<Withdrawal[]>([]);
const activeTab = ref<'earned' | 'spent'>('earned');
const loading = ref(true);

const fetchDetails = async (userId: string) => {
  loading.value = true;
  const userData = await supabaseService.getUserById(userId);
  if (userData) {
    user.value = userData;
    
    // Parallel fetch for history
    const [disposals, withdrawals] = await Promise.all([
      hardwareApiService.getDisposalRecords(userData.phone),
      supabaseService.getUserWithdrawalHistory(userId)
    ]);
    
    disposalHistory.value = disposals;
    withdrawalHistory.value = withdrawals;
  }
  loading.value = false;
};

onMounted(() => {
  if (route.params.id) {
    fetchDetails(route.params.id as string);
  }
});

watch(() => route.params.id, (newId) => {
  if (newId) fetchDetails(newId as string);
});
</script>

<template>
  <div v-if="loading || !user" class="p-10 text-center text-gray-500">Loading profile...</div>

  <div v-else class="space-y-6">
    <RouterLink to="/users" class="text-sm text-gray-500 hover:text-gray-900 mb-4 inline-block">&larr; Back to Users</RouterLink>
    
    <!-- Profile Header -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row justify-between items-center">
      <div class="flex items-center space-x-4">
          <div class="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl">👤</div>
          <div>
              <h1 class="text-2xl font-bold text-gray-900">{{ user?.phone }}</h1>
                <p class="text-sm text-gray-500">ID: {{ user?.vendor_user_no }}</p>
          </div>
      </div>
      <div class="mt-4 md:mt-0 text-center md:text-right">
          <div class="text-sm text-gray-500 uppercase tracking-wide">Lifetime Points</div>
          <div class="text-3xl font-bold text-blue-600">{{ user.lifetime_integral }}</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[400px]">
      <div class="border-b border-gray-100 flex">
          <button 
              @click="activeTab = 'earned'"
              :class="`flex-1 py-4 text-center text-sm font-medium border-b-2 transition-colors ${activeTab === 'earned' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:bg-gray-50'}`"
          >
              Recycling History (API Source)
          </button>
          <button 
              @click="activeTab = 'spent'"
              :class="`flex-1 py-4 text-center text-sm font-medium border-b-2 transition-colors ${activeTab === 'spent' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:bg-gray-50'}`"
          >
              Withdrawal History (Local DB)
          </button>
      </div>

      <div class="p-0">
          <div v-if="activeTab === 'earned'" class="overflow-x-auto">
              <table class="w-full text-left">
                  <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                          <th class="px-6 py-3">Time</th>
                          <th class="px-6 py-3">Machine</th>
                          <th class="px-6 py-3">Type</th>
                          <th class="px-6 py-3">Weight (kg)</th>
                          <th class="px-6 py-3 text-right">Points Earned</th>
                      </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                      <tr v-if="disposalHistory.length === 0"><td colspan="5" class="p-6 text-center text-gray-400">No records found via API</td></tr>
                      <tr v-for="d in disposalHistory" :key="d.id" class="hover:bg-gray-50">
                          <td class="px-6 py-3 text-sm text-gray-600">{{ d.createTime }}</td>
                          <td class="px-6 py-3 text-sm text-gray-500 font-mono">{{ d.deviceNo }}</td>
                          <td class="px-6 py-3 text-sm">
                              <span class="bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-xs">{{ d.rubbishName }}</span>
                          </td>
                          <td class="px-6 py-3 text-sm text-gray-900">{{ d.weight }}</td>
                          <td class="px-6 py-3 text-sm text-right font-bold text-green-600">+{{ d.integral }}</td>
                      </tr>
                  </tbody>
              </table>
          </div>

          <div v-if="activeTab === 'spent'" class="overflow-x-auto">
               <table class="w-full text-left">
                  <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                          <th class="px-6 py-3">Date</th>
                          <th class="px-6 py-3">Amount</th>
                          <th class="px-6 py-3">Status</th>
                      </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                      <tr v-if="withdrawalHistory.length === 0"><td colspan="3" class="p-6 text-center text-gray-400">No withdrawals found</td></tr>
                      <tr v-for="w in withdrawalHistory" :key="w.id" class="hover:bg-gray-50">
                          <td class="px-6 py-3 text-sm text-gray-600">{{ new Date(w.created_at).toLocaleString() }}</td>
                          <td class="px-6 py-3 text-sm font-bold text-red-600">-{{ w.amount }}</td>
                          <td class="px-6 py-3 text-sm">
                              <span :class="`px-2 py-1 rounded-full text-xs font-semibold ${
                                  w.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                                  w.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                  'bg-amber-100 text-amber-700'
                              }`">
                                  {{ w.status }}
                              </span>
                          </td>
                      </tr>
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  </div>
</template>