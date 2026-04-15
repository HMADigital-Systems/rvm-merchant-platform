<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useMachineStore } from '../stores/machines';
import { supabase } from '../services/supabase';
import { 
  Users, MapPin, Search, FileSpreadsheet, Send, 
  ChevronLeft, ChevronRight, Award, Clock, TrendingUp
} from 'lucide-vue-next';
import * as XLSX from 'xlsx';

const router = useRouter();
const auth = useAuthStore();
const { machines } = useMachineStore();

interface ActiveRecycler {
  id: string;
  user_id: string;
  nickname: string;
  phone: string;
  avatar_url: string | null;
  total_weight_recycled: number;
  last_submission_at: string | null;
  machine_name: string;
  machine_id: string;
  monthly_goal: number;
  progress_percentage: number;
  is_online: boolean;
}

const loading = ref(true);
const error = ref<string | null>(null);
const activeRecyclers = ref<ActiveRecycler[]>([]);
const locationFilter = ref('');
const currentPage = ref(1);
const itemsPerPage = ref(20);

const MONTHLY_GOAL = 50;

const fetchActiveRecyclers = async () => {
  loading.value = true;
  error.value = null;
  
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    let query = supabase
      .from('submission_reviews')
      .select(`
        id,
        user_id,
        users(id, nickname, phone, avatar_url, total_weight_recycled),
        device_no,
        machines(id, name, device_no),
        submitted_at,
        api_weight
      `)
      .eq('status', 'VERIFIED')
      .gte('submitted_at', startOfMonth.toISOString())
      .order('submitted_at', { ascending: false });

    if (auth.merchantId) {
      query = query.eq('merchant_id', auth.merchantId);
    }

    const { data, error: fetchError } = await query;
    
    if (fetchError) throw fetchError;

    const userMap = new Map<string, ActiveRecycler>();
    
    for (const item of data || []) {
      const userId = item.user_id;
      const submissionDate = new Date(item.submitted_at);
      const isOnline = submissionDate >= threeDaysAgo;
      
      if (!userMap.has(userId)) {
        userMap.set(userId, {
          id: item.id,
          user_id: userId,
          nickname: item.users?.nickname || 'Unknown User',
          phone: item.users?.phone || '',
          avatar_url: item.users?.avatar_url || null,
          total_weight_recycled: item.users?.total_weight_recycled || 0,
          last_submission_at: item.submitted_at,
          machine_name: item.machines?.name || item.device_no || '',
          machine_id: item.machines?.device_no || item.device_no || '',
          monthly_goal: MONTHLY_GOAL,
          progress_percentage: 0,
          is_online: isOnline
        });
      } else {
        const existing = userMap.get(userId)!;
        if (item.submitted_at > existing.last_submission_at) {
          existing.last_submission_at = item.submitted_at;
          existing.is_online = existing.is_online || isOnline;
        }
      }
    }

    const result = Array.from(userMap.values()).map(user => ({
      ...user,
      progress_percentage: Math.min(100, Math.round((user.total_weight_recycled / user.monthly_goal) * 100))
    }));

    activeRecyclers.value = result;
  } catch (err: any) {
    console.error('Failed to fetch active recyclers:', err);
    error.value = 'Failed to load active recyclers data';
  } finally {
    loading.value = false;
  }
};

const filteredRecyclers = computed(() => {
  let result = activeRecyclers.value;
  
  if (locationFilter.value) {
    const searchTerm = locationFilter.value.toLowerCase();
    result = result.filter(r => 
      r.machine_name.toLowerCase().includes(searchTerm) ||
      r.machine_id.toLowerCase().includes(searchTerm)
    );
  }
  
  return result;
});

const totalPages = computed(() => Math.ceil(filteredRecyclers.value.length / itemsPerPage.value));

const paginatedRecyclers = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return filteredRecyclers.value.slice(start, start + itemsPerPage.value);
});

const formatDate = (dateString: string | null) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-MY', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const exportToExcel = () => {
  const data = filteredRecyclers.value.map(item => ({
    'User': item.nickname,
    'Phone': item.phone,
    'Machine Location': item.machine_name,
    'Total Recycled (kg)': item.total_weight_recycled,
    'Monthly Goal (kg)': item.monthly_goal,
    'Progress %': item.progress_percentage,
    'Last Submission': formatDate(item.last_submission_at),
    'Status': item.is_online ? 'Active' : 'Inactive'
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Active Recyclers');
  XLSX.writeFile(wb, `active_recyclers_${new Date().toISOString().split('T')[0]}.xlsx`);
};

const sendEncouragement = async () => {
  const usersNearGoal = activeRecyclers.value.filter(
    r => !r.is_online && r.progress_percentage >= 50 && r.progress_percentage < 100
  );

  if (usersNearGoal.length === 0) {
    alert('No users found near their monthly goal to send encouragement.');
    return;
  }

  const confirmMsg = `Send encouragement notification to ${usersNearGoal.length} users who are near their monthly goal?`;
  if (!confirm(confirmMsg)) return;

  try {
    const notifications = usersNearGoal.map(user => ({
      user_email: user.phone + '@app',
      title: 'You\'re Almost There! 🌟',
      message: `You're making great progress! Keep recycling to reach your monthly goal of ${user.monthly_goal}kg. Every piece counts!`,
      is_read: false
    }));

    const { error: insertError } = await supabase
      .from('notifications')
      .upsert(notifications, { onConflict: 'user_email, title' });

    if (insertError) throw insertError;

    alert(`Encouragement sent to ${usersNearGoal.length} users!`);
  } catch (err: any) {
    console.error('Failed to send encouragement:', err);
    alert('Failed to send notifications. Please try again.');
  }
};

onMounted(async () => {
  await fetchActiveRecyclers();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Live Recycler Monitor</h1>
        <p class="text-sm text-gray-500 mt-1">Users with verified submissions this month</p>
      </div>

      <div class="flex gap-3">
        <button 
          @click="exportToExcel"
          class="flex items-center px-4 py-2 border border-green-200 text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-all"
        >
          <FileSpreadsheet :size="18" class="mr-2" />
          Export Active Users List
        </button>

        <button 
          @click="sendEncouragement"
          class="flex items-center px-4 py-2 border border-amber-200 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-all"
        >
          <Send :size="18" class="mr-2" />
          Send Encouragement
        </button>
      </div>
    </div>

    <div class="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100">
      <div class="flex items-center gap-2 text-gray-500">
        <MapPin :size="18" />
        <span class="text-sm font-medium">Machine Location:</span>
      </div>
      <input 
        v-model="locationFilter"
        type="text"
        placeholder="Search by location..."
        class="flex-1 max-w-md px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
      />
      <div class="text-sm text-gray-500">
        Showing <span class="font-medium text-gray-900">{{ filteredRecyclers.length }}</span> active recyclers
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      <div class="overflow-x-auto w-full">
        <table class="w-full text-left">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
            <tr>
              <th class="px-6 py-4">Status</th>
              <th class="px-6 py-4">User</th>
              <th class="px-6 py-4">Phone</th>
              <th class="px-6 py-4">Machine Location</th>
              <th class="px-6 py-4">Total Recycled</th>
              <th class="px-6 py-4">Monthly Goal</th>
              <th class="px-6 py-4">Progress</th>
              <th class="px-6 py-4">Last Submission</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="loading"><td colspan="8" class="p-8 text-center text-gray-400">Loading...</td></tr>
            <tr v-else-if="error"><td colspan="8" class="p-8 text-center text-red-400">{{ error }}</td></tr>
            <tr v-else-if="paginatedRecyclers.length === 0"><td colspan="8" class="p-8 text-center text-gray-400">No active recyclers found.</td></tr>
            
            <tr v-for="user in paginatedRecyclers" :key="user.user_id" class="hover:bg-gray-50 transition-colors">
              <td class="px-6 py-4">
                <span v-if="user.is_online" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                  <span class="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                  Online/Active
                </span>
                <span v-else class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                  Inactive
                </span>
              </td>

              <td class="px-6 py-4">
                <div class="flex items-center">
                  <div class="h-8 w-8 rounded-full mr-3 bg-slate-100 border flex items-center justify-center overflow-hidden shrink-0">
                    <img v-if="user.avatar_url" :src="user.avatar_url" class="h-full w-full object-cover" />
                    <span v-else class="text-xs">👤</span>
                  </div>
                  <span class="text-sm font-bold text-gray-900">{{ user.nickname }}</span>
                </div>
              </td>

              <td class="px-6 py-4">
                <span class="text-sm text-gray-600 font-mono">{{ user.phone || '-' }}</span>
              </td>

              <td class="px-6 py-4">
                <div class="flex items-center text-sm text-gray-700">
                  <MapPin :size="14" class="mr-1.5 text-gray-400" />
                  {{ user.machine_name || user.machine_id }}
                </div>
              </td>

              <td class="px-6 py-4">
                <div class="flex items-center">
                  <span class="text-lg font-bold text-gray-900">{{ user.total_weight_recycled.toFixed(1) }}</span>
                  <span class="text-xs text-gray-500 ml-1">kg</span>
                </div>
              </td>

              <td class="px-6 py-4">
                <span class="text-sm text-gray-600">{{ user.monthly_goal }} kg</span>
              </td>

              <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                  <div class="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      class="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all"
                      :style="{ width: `${user.progress_percentage}%` }"
                    ></div>
                  </div>
                  <span class="text-xs font-medium" :class="user.progress_percentage >= 100 ? 'text-green-600' : 'text-gray-600'">
                    {{ user.progress_percentage }}%
                  </span>
                </div>
              </td>

              <td class="px-6 py-4">
                <div class="flex items-center text-sm text-gray-500">
                  <Clock :size="14" class="mr-1.5" />
                  {{ formatDate(user.last_submission_at) }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
        <span class="text-sm text-gray-500">
          Showing <span class="font-medium text-gray-900">{{ (currentPage - 1) * itemsPerPage + 1 }}</span>
          to <span class="font-medium text-gray-900">{{ Math.min(currentPage * itemsPerPage, filteredRecyclers.length) }}</span>
          of <span class="font-medium text-gray-900">{{ filteredRecyclers.length }}</span> results
        </span>

        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-500">Rows:</span>
            <select v-model="itemsPerPage" class="text-sm border-gray-300 rounded-lg bg-white py-1">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </div>
          <div class="flex items-center bg-white rounded-lg border border-gray-300 overflow-hidden">
            <button @click="currentPage--" :disabled="currentPage === 1" class="px-3 py-1 hover:bg-gray-50 disabled:opacity-50 border-r">
              <ChevronLeft :size="16" />
            </button>
            <span class="px-4 py-1 text-sm font-medium text-gray-700">Page {{ currentPage }} of {{ totalPages || 1 }}</span>
            <button @click="currentPage++" :disabled="currentPage >= totalPages" class="px-3 py-1 hover:bg-gray-50 disabled:opacity-50">
              <ChevronRight :size="16" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>