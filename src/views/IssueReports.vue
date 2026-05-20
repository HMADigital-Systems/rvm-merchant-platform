<script setup lang="ts">
import { ref, computed } from 'vue';
import { AlertCircle, Search, RefreshCw } from 'lucide-vue-next';

// ========================================
// ISSUE REPORTS DATA
// ========================================
interface IssueReport {
  id: string;
  machine: string;
  issue: string;
  details: string;
  reportedBy: string;
  date: string;
  status: string;
}

const issueReports = ref<IssueReport[]>([
  {
    id: 'IR-001',
    machine: '071582000006',
    issue: 'error',
    details: 'Viewer Report',
    reportedBy: 'ameerredwan03@gmail.com',
    date: '5/6/2026',
    status: 'IN PROGRESS'
  },
  {
    id: 'IR-002',
    machine: '071582000100',
    issue: 'Machine requires routine cleaning and inspection.',
    details: '',
    reportedBy: 'alfredli@hmadigital.asia',
    date: '4/11/2026',
    status: 'PENDING'
  }
]);

// ========================================
// FILTERS
// ========================================
const searchQuery = ref('');
const statusFilter = ref('All Statuses');
const statusOptions = ['All Statuses', 'PENDING', 'IN PROGRESS', 'RESOLVED', 'ISSUE REPORTED'];

const filteredReports = computed(() => {
  return issueReports.value.filter(r => {
    const q = searchQuery.value.toLowerCase();
    if (q) {
      const match =
        r.machine.toLowerCase().includes(q) ||
        r.issue.toLowerCase().includes(q) ||
        r.reportedBy.toLowerCase().includes(q) ||
        r.details.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (statusFilter.value !== 'All Statuses' && r.status !== statusFilter.value) return false;
    return true;
  });
});

// ========================================
// ACTIONS
// ========================================
const updateIssueStatus = (id: string, newStatus: string) => {
  const report = issueReports.value.find(r => r.id === id);
  if (report) {
    report.status = newStatus;
    console.log(`[Issues] ${id} status → ${newStatus}`);
  }
};

const handleRefresh = () => {
  console.log('[Issues] Refresh');
  // Future: re-fetch from API
};

const statusSelectClass = (status: string) => {
  if (status === 'RESOLVED') {
    return 'text-emerald-600 border-emerald-200 bg-emerald-50/30 font-semibold';
  }
  if (status === 'IN PROGRESS') {
    return 'text-blue-600 border-blue-200 bg-blue-50/30 font-semibold';
  }
  if (status === 'PENDING') {
    return 'text-amber-600 border-amber-200 bg-amber-50/30 font-semibold';
  }
  return 'text-gray-600 border-gray-200 bg-gray-50/30 font-semibold';
};
</script>

<template>
  <div class="space-y-6">

    <!-- ================================ -->
    <!-- HEADER                           -->
    <!-- ================================ -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <AlertCircle class="text-red-500" :size="28" />
          Issue Reports
        </h1>
      </div>

      <div class="flex items-center gap-3">
        <button
          @click="handleRefresh"
          class="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-slate-700 rounded-xl px-4 py-2 text-sm font-medium transition"
        >
          <RefreshCw :size="16" />
          Refresh
        </button>
      </div>
    </div>

    <!-- ================================ -->
    <!-- SEARCH & FILTER                  -->
    <!-- ================================ -->
    <div class="flex flex-col md:flex-row gap-3">
      <div class="relative flex-1">
        <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by machine, notes, or reporter..."
          class="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400"
        />
      </div>
      <select
        v-model="statusFilter"
        class="px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-700 md:w-44"
      >
        <option v-for="opt in statusOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>
    </div>

    <!-- ================================ -->
    <!-- ISSUES TABLE                     -->
    <!-- ================================ -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
            <tr>
              <th class="px-6 py-4">Machine</th>
              <th class="px-6 py-4">Issue</th>
              <th class="px-6 py-4">Reported By</th>
              <th class="px-6 py-4">Date</th>
              <th class="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr
              v-for="report in filteredReports"
              :key="report.id"
              class="hover:bg-gray-50 transition-colors"
            >
              <!-- Machine -->
              <td class="px-6 py-4">
                <span class="text-sm font-medium text-gray-900 font-mono">{{ report.machine }}</span>
              </td>

              <!-- Issue -->
              <td class="px-6 py-4">
                <!-- Category style (bold + link) -->
                <template v-if="report.details">
                  <p class="text-sm font-bold text-gray-900">{{ report.issue }}</p>
                  <a class="text-xs text-blue-600 hover:underline cursor-pointer">{{ report.details }}</a>
                </template>
                <!-- Note style (regular text) -->
                <p v-else class="text-sm text-gray-700">{{ report.issue }}</p>
              </td>

              <!-- Reported By -->
              <td class="px-6 py-4">
                <span class="text-sm text-gray-700">{{ report.reportedBy }}</span>
              </td>

              <!-- Date -->
              <td class="px-6 py-4">
                <span class="text-sm text-gray-600">{{ report.date }}</span>
              </td>

              <!-- Status (Dropdown) -->
              <td class="px-6 py-4">
                <select
                  :value="report.status"
                  @change="updateIssueStatus(report.id, ($event.target as HTMLSelectElement).value)"
                  class="text-xs rounded-lg px-2 py-1 border focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  :class="statusSelectClass(report.status)"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="IN PROGRESS">IN PROGRESS</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="ISSUE REPORTED">ISSUE REPORTED</option>
                </select>
              </td>
            </tr>

            <!-- Empty state -->
            <tr v-if="filteredReports.length === 0">
              <td colspan="5" class="px-6 py-12 text-center text-gray-400 text-sm">
                <AlertCircle class="mx-auto text-gray-200 mb-3" :size="48" />
                No issue reports found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>
