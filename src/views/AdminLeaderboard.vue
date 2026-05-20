<script setup lang="ts">
import { ref } from 'vue';
import { Trophy, RefreshCw, TrendingUp, Crown, Eye, Leaf, Award } from 'lucide-vue-next';

// ========================================
// TAB STATE (reactive id-based)
// ========================================
const activeTab = ref('current');
const tabs = [
  { id: 'current', label: 'Current Leaderboard', icon: TrendingUp },
  { id: 'monthly', label: 'Monthly Champions', icon: Crown }
];

// ========================================
// LEADERBOARD DATA (hex color tags)
// ========================================
const leaderboards = ref<any[]>([]);
const leaderboardLoading = ref(true);

const monthlyLeaderboards = ref<any[]>([]);

const fetchLeaderboard = async () => {
  leaderboardLoading.value = true;
  try {
    const { supabase } = await import('../services/supabase');
    const colors = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#eab308', '#6366f1', '#f43f5e', '#0ea5e9'];
    
    // 1. All-time leaderboard (from users table)
    const { data: allTime } = await supabase
      .from('users')
      .select('user_id, nickname, total_weight')
      .not('total_weight', 'is', null)
      .neq('total_weight', 0)
      .order('total_weight', { ascending: false })
      .limit(20);
    
    if (allTime) {
      leaderboards.value = allTime
        .filter((u: any) => u.nickname)
        .map((u: any, i: number) => ({
          rank: i + 1,
          name: u.nickname,
          initial: (u.nickname || '?')[0].toUpperCase(),
          color: colors[i % colors.length],
          id: u.user_id,
          totalWeight: Number(u.total_weight || 0),
          carbonSaved: Number(u.total_weight || 0) * 0.85,
          submissions: 0
        }));
    }
    
    // 2. Monthly leaderboard (from submission_reviews this month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const { data: monthlyData } = await supabase
      .from('submission_reviews')
      .select('user_id, api_weight')
      .eq('status', 'VERIFIED')
      .gte('submitted_at', startOfMonth.toISOString());
    
    if (monthlyData && monthlyData.length > 0) {
      // Aggregate by user_id
      const userTotals = new Map<string, number>();
      monthlyData.forEach((r: any) => {
        const uid = r.user_id;
        userTotals.set(uid, (userTotals.get(uid) || 0) + Number(r.api_weight || 0));
      });
      
      // Get user profiles for the top monthly users
      const topUserIds = [...userTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([id]) => id);
      
      const { data: profiles } = await supabase
        .from('users')
        .select('user_id, nickname')
        .in('user_id', topUserIds);
      
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      
      monthlyLeaderboards.value = [...userTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([userId, weight], i) => {
          const profile = profileMap.get(userId);
          return {
            rank: i + 1,
            name: profile?.nickname || 'User #' + userId.slice(-4),
            initial: (profile?.nickname || '?')[0].toUpperCase(),
            color: colors[i % colors.length],
            id: userId,
            totalWeight: weight,
            carbonSaved: weight * 0.85,
            submissions: 0
          };
        });
    }
  } catch (e) {
    console.error('Failed to fetch leaderboard:', e);
  } finally {
    leaderboardLoading.value = false;
  }
};

// Fetch on mount
fetchLeaderboard();

// ========================================
// RANK STYLING
// ========================================
const rankBadgeClass = (rank: number) => {
  if (rank === 1) return 'bg-amber-100 text-amber-700 border-amber-300';
  if (rank === 2) return 'bg-slate-100 text-slate-600 border-slate-300';
  if (rank === 3) return 'bg-orange-100 text-orange-700 border-orange-300';
  return 'bg-gray-100 text-gray-500 border-gray-200';
};

const setTab = (tabId: string) => { activeTab.value = tabId; };

const showHistoryModal = ref(false);
const selectedUser = ref<any>(null);
const userHistory = ref<any[]>([]);
const historyLoading = ref(false);

const viewHistory = async (user: any) => {
  selectedUser.value = user;
  showHistoryModal.value = true;
  historyLoading.value = true;
  userHistory.value = [];
  
  try {
    const { supabase } = await import('../services/supabase');
    const { data } = await supabase
      .from('submission_reviews')
      .select('id, device_no, waste_type, api_weight, calculated_value, status, submitted_at')
      .eq('user_id', user.user_id)
      .order('submitted_at', { ascending: false })
      .limit(20);
    
    if (data) userHistory.value = data;
  } catch (e) {
    console.error('Failed to fetch history:', e);
  } finally {
    historyLoading.value = false;
  }
};

const resetLeaderboard = () => {
  console.log('[Leaderboard] Reset triggered');
};
</script>

<template>
  <div class="space-y-6">

    <!-- ================================ -->
    <!-- BREADCRUMBS + HEADER             -->
    <!-- ================================ -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <div class="flex items-center gap-1 text-sm text-gray-400 mb-1">
          <span>Dashboard</span>
          <span class="mx-1">&gt;</span>
          <span class="text-gray-600">Admin Leaderboard</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Trophy class="text-orange-500" :size="28" />
          Leaderboard & Audit
        </h1>
        <p class="text-sm text-gray-500 mt-1">Monitor top performers and audit transactions.</p>
      </div>
      <div>
        <button
          @click="resetLeaderboard"
          class="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2 text-sm font-semibold transition shadow-sm"
        >
          <RefreshCw :size="16" />
          Reset Leaderboard
        </button>
      </div>
    </div>

    <!-- ================================ -->
    <!-- TABS (id-based)                   -->
    <!-- ================================ -->
    <div class="flex border-b border-gray-100">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="setTab(tab.id)"
        class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
        :class="activeTab === tab.id
          ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
          : 'text-gray-500 hover:text-gray-700'"
      >
        <component :is="tab.icon" :size="16" />
        {{ tab.label }}
      </button>
    </div>

    <!-- ================================ -->
    <!-- SUMMARY METRICS                  -->
    <!-- ================================ -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p class="text-xs text-gray-500 uppercase font-semibold tracking-wide">Total Users</p>
        <p class="text-3xl font-bold text-gray-900 mt-1">{{ (activeTab === 'monthly' ? monthlyLeaderboards : leaderboards).length }}</p>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p class="text-xs text-gray-500 uppercase font-semibold tracking-wide">Total Weight</p>
        <p class="text-3xl font-bold text-gray-900 mt-1">{{ ((activeTab === 'monthly' ? monthlyLeaderboards : leaderboards).reduce((s: number, u: any) => s + u.totalWeight, 0) / 1000).toFixed(1) }}k <span class="text-sm font-normal text-gray-500">kg</span></p>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p class="text-xs text-gray-500 uppercase font-semibold tracking-wide">Carbon Saved</p>
        <p class="text-3xl font-bold text-emerald-600 mt-1">{{ ((activeTab === 'monthly' ? monthlyLeaderboards : leaderboards).reduce((s: number, u: any) => s + u.carbonSaved, 0) / 1000).toFixed(1) }}k <span class="text-sm font-normal text-gray-500">kg</span></p>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p class="text-xs text-gray-500 uppercase font-semibold tracking-wide">Avg / User</p>
        <p class="text-3xl font-bold text-gray-900 mt-1">{{ (activeTab === 'monthly' ? monthlyLeaderboards : leaderboards).length > 0 ? ((activeTab === 'monthly' ? monthlyLeaderboards : leaderboards).reduce((s: number, u: any) => s + u.totalWeight, 0) / (activeTab === 'monthly' ? monthlyLeaderboards : leaderboards).length).toFixed(1) : 0 }} <span class="text-sm font-normal text-gray-500">kg</span></p>
      </div>
    </div>

    <!-- ================================ -->
    <!-- LEADERBOARD TABLE (rounded-3xl p-6) -->
    <!-- ================================ -->
    <div class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-6">
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="text-gray-500 text-xs uppercase font-semibold">
            <tr>
              <th class="px-6 py-4">Rank</th>
              <th class="px-6 py-4">User</th>
              <th class="px-6 py-4">ID</th>
              <th class="px-6 py-4">Total Weight</th>
              <th class="px-6 py-4">Carbon Saved</th>
              <th class="px-6 py-4">Submissions</th>
              <th class="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr
              v-for="user in (activeTab === 'monthly' ? monthlyLeaderboards : leaderboards)"
              :key="user.id"
              class="hover:bg-gray-50 transition-colors"
            >
              <!-- Rank -->
              <td class="px-6 py-4">
                <span
                  class="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border"
                  :class="rankBadgeClass(user.rank)"
                >
                  {{ user.rank }}
                </span>
              </td>

              <!-- User (hex color) -->
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <span
                    class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    :style="{ backgroundColor: user.color }"
                  >
                    {{ user.initial }}
                  </span>
                  <span class="text-sm font-bold text-gray-900">{{ user.name }}</span>
                </div>
              </td>

              <!-- ID -->
              <td class="px-6 py-4">
                <span class="text-sm text-gray-400 font-mono">{{ user.id }}</span>
              </td>

              <!-- Total Weight -->
              <td class="px-6 py-4">
                <span class="text-sm font-bold text-gray-900">{{ user.totalWeight.toFixed(1) }} <span class="text-xs font-normal text-gray-400">kg</span></span>
              </td>

              <!-- Carbon Saved -->
              <td class="px-6 py-4">
                <span class="inline-flex items-center gap-1 text-sm font-bold text-emerald-600">
                  <Leaf :size="14" />
                  {{ user.carbonSaved.toFixed(1) }} kg
                </span>
              </td>

              <!-- Submissions -->
              <td class="px-6 py-4">
                <span class="text-sm font-bold text-gray-900 text-center block">{{ user.submissions }}</span>
              </td>

              <!-- Actions -->
              <td class="px-6 py-4">
                <button
                  @click="viewHistory(user)"
                  class="flex items-center gap-1.5 border border-blue-100 bg-blue-50/50 hover:bg-blue-100 text-blue-600 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                >
                  <Eye :size="14" />
                  View History
                </button>
              </td>
            </tr>

            <tr v-if="leaderboardLoading">
              <td colspan="7" class="px-6 py-12 text-center text-gray-400 text-sm">Loading leaderboard...</td>
            </tr>
            <tr v-else-if="leaderboards.length === 0">
              <td colspan="7" class="px-6 py-12 text-center text-gray-400 text-sm">
                <Trophy class="mx-auto text-gray-200 mb-3" :size="48" />
                No leaderboard data
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>

    <!-- History Modal -->
    <Teleport to="body">
      <div v-if="showHistoryModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" @click="showHistoryModal = false">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden" @click.stop>
          <div class="flex items-center justify-between p-5 border-b border-gray-100">
            <div>
              <h3 class="text-lg font-bold text-gray-900">Recycling History</h3>
              <p v-if="selectedUser" class="text-sm text-gray-500">{{ selectedUser.nickname }} — {{ selectedUser.total_weight?.toFixed(1) }} kg total</p>
            </div>
            <button @click="showHistoryModal = false" class="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="p-5 overflow-y-auto max-h-[60vh]">
            <div v-if="historyLoading" class="text-center py-8 text-gray-400">Loading...</div>
            <div v-else-if="userHistory.length === 0" class="text-center py-8 text-gray-400">No submissions found</div>
            <table v-else class="w-full text-left text-sm">
              <thead class="text-xs text-gray-500 uppercase">
                <tr><th class="pb-2 pr-2">Date</th><th class="pb-2 pr-2">Machine</th><th class="pb-2 pr-2">Type</th><th class="pb-2 pr-2 text-right">Weight</th><th class="pb-2 pr-2 text-right">Points</th><th class="pb-2 text-right">Status</th></tr>
              </thead>
              <tbody>
                <tr v-for="item in userHistory" :key="item.id" class="border-t border-gray-50">
                  <td class="py-2 pr-2 text-gray-600">{{ item.submitted_at?.substring(0,10) }}</td>
                  <td class="py-2 pr-2 font-mono text-xs text-gray-500">{{ item.device_no?.substring(0,8) || '-' }}</td>
                  <td class="py-2 pr-2 text-gray-700">{{ item.waste_type || '-' }}</td>
                  <td class="py-2 pr-2 text-right font-mono">{{ (item.api_weight || 0).toFixed(2) }}</td>
                  <td class="py-2 pr-2 text-right font-mono">{{ (item.calculated_value || 0).toFixed(2) }}</td>
                  <td class="py-2 text-right"><span :class="'text-xs font-semibold px-2 py-0.5 rounded-full ' + (item.status === 'VERIFIED' ? 'bg-green-100 text-green-700' : item.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')">{{ item.status }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Teleport>

</template>
