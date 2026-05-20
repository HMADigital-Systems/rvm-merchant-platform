<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useCleaningRecords } from '../composables/useCleaningRecords';
import { useAuthStore } from '../stores/auth';
import CleaningVerificationModal from '../components/CleaningVerificationModal.vue';
import { Truck, Clock, Search, Scale, User, ImageIcon, CheckCircle, XCircle, RefreshCw, Download, MapPin } from 'lucide-vue-next';
import ExportSummaryModal from '../components/ExportSummaryModal.vue';

const { records, loading, fetchCleaningLogs, approveCleaning, rejectCleaning, formatDate } = useCleaningRecords();
const auth = useAuthStore();
const searchTerm = ref('');

// Modal State
const showModal = ref(false);
const showExportModal = ref(false);
const selectedRecord = ref<any>(null);
const isProcessing = ref(false);

const filteredRecords = computed(() => {
  if (!searchTerm.value) return records.value;
  const term = searchTerm.value.toLowerCase();
  return records.value.filter(r => 
    r.device_no?.includes(term) || 
    r.waste_type?.toLowerCase().includes(term) ||
    r.cleaner_name?.toLowerCase().includes(term)
  );
});

const handleRefresh = async () => {
    await fetchCleaningLogs();
};

// Actions
const openVerifyModal = (record: any) => {
    selectedRecord.value = record;
    showModal.value = true;
};

const handleApprove = async () => {
    if (!selectedRecord.value) return;
    isProcessing.value = true;
    await approveCleaning(selectedRecord.value.id);
    isProcessing.value = false;
    showModal.value = false;
};

const handleReject = async (reason: string) => {
    if (!selectedRecord.value) return;
    isProcessing.value = true;
    await rejectCleaning(selectedRecord.value.id, reason);
    isProcessing.value = false;
    showModal.value = false;
};

// Selection & Export
const selectedIds = ref(new Set<string>());

const toggleSelection = (id: string) => {
  const newSet = new Set(selectedIds.value);
  if (newSet.has(id)) newSet.delete(id);
  else newSet.add(id);
  selectedIds.value = newSet;
};

const toggleSelectAll = () => {
  const newSet = new Set(selectedIds.value);
  const allIds = filteredRecords.value.map(r => r.id);
  const allSelected = allIds.every(id => newSet.has(id));

  if (allSelected) {
    allIds.forEach(id => newSet.delete(id));
  } else {
    allIds.forEach(id => newSet.add(id));
  }
  selectedIds.value = newSet;
};

const isPageSelected = computed(() => {
  return filteredRecords.value.length > 0 && filteredRecords.value.every(r => selectedIds.value.has(r.id));
});

const dataToExport = computed(() => {
  if (selectedIds.value.size > 0) {
    return records.value.filter(r => selectedIds.value.has(r.id));
  }
  return filteredRecords.value;
});

onMounted(() => {
  fetchCleaningLogs();
});

watch(() => auth.loading, (isLoading) => {
  if (!isLoading) fetchCleaningLogs();
});

watch(() => auth.role, (newRole) => {
  if (newRole) fetchCleaningLogs();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <p class="text-xs text-gray-500 uppercase font-semibold">Total Tasks</p>
        <p class="text-2xl font-bold text-gray-900">{{ records.length }}</p>
      </div>
      <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <p class="text-xs text-gray-500 uppercase font-semibold">RVM Collections</p>
        <p class="text-2xl font-bold text-blue-600">{{ records.filter(r => r.source_type === 'RVM').length }}</p>
      </div>
      <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <p class="text-xs text-gray-500 uppercase font-semibold">On-Demand</p>
        <p class="text-2xl font-bold text-purple-600">{{ records.filter(r => r.source_type === 'ON_DEMAND').length }}</p>
      </div>
      <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <p class="text-xs text-gray-500 uppercase font-semibold">Total Weight</p>
        <p class="text-2xl font-bold text-amber-600">{{ records.reduce((s, r) => s + r.bag_weight_collected, 0).toFixed(1) }} <span class="text-sm font-normal text-gray-500">kg</span></p>
      </div>
    </div>

    <div class="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 flex items-center">
          <Truck class="mr-3 text-emerald-600" :size="28" />
          Collection Tasks
        </h1>
        <p class="text-sm text-gray-500 mt-1">Collector assignments — RVM machine cleanup and on-demand pickups.</p>
      </div>

      <div class="flex gap-3 w-full md:w-auto">
        <button 
        @click="showExportModal = true"
        :disabled="filteredRecords.length === 0"
        class="flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-all font-medium disabled:opacity-50"
        >
            <Download :size="18" class="mr-2" />
            <span>{{ selectedIds.size > 0 ? `Export (${selectedIds.size})` : 'Export' }}</span>
        </button>

        <button 
            @click="handleRefresh" 
            :disabled="loading" 
            class="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm font-medium"
        >
            <RefreshCw :size="18" :class="{'animate-spin': loading, 'mr-2': true}" />
            {{ loading ? 'Refreshing...' : 'Refresh Data' }}
        </button>

        <div class="relative w-full md:w-64">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" :size="18" />
            <input 
            v-model="searchTerm"
            type="text" 
            placeholder="Search device/collector..." 
            class="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
        </div>
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
          <tr>
            <th class="px-6 py-4 w-10">
                <input 
                    type="checkbox" 
                    :checked="isPageSelected" 
                    @change="toggleSelectAll" 
                    class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4" 
                />
            </th>
            <th class="px-6 py-4">Date/Time</th>
            <th class="px-6 py-4">Source</th>
            <th class="px-6 py-4">Location</th>
            <th class="px-6 py-4">Waste Type</th>
            <th class="px-6 py-4 text-center">Weight</th>
            <th class="px-6 py-4">Collector</th>
            <th class="px-6 py-4 text-center">Status</th>
            <th class="px-6 py-4 text-center">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-if="loading" class="animate-pulse">
            <td colspan="9" class="p-8 text-center text-gray-400">Loading collection tasks...</td>
          </tr>
          <tr v-else-if="filteredRecords.length === 0">
            <td colspan="9" class="p-8 text-center text-gray-400">No collection tasks found.</td>
          </tr>
          
          <tr 
            v-for="item in filteredRecords" 
            :key="item.id" 
            :class="{'bg-emerald-50/50': selectedIds.has(item.id)}" 
            class="hover:bg-gray-50 transition-colors"
          >
            <td class="px-6 py-4">
                <input 
                    type="checkbox" 
                    :checked="selectedIds.has(item.id)" 
                    @change="toggleSelection(item.id)" 
                    class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4" 
                />
            </td>
            <td class="px-6 py-4">
              <div class="flex items-center text-sm text-gray-700 font-medium">
                <Clock :size="16" class="mr-2 text-gray-400" />
                {{ formatDate(item.cleaned_at || item.cleaned_at) }}
              </div>
            </td>

            <td class="px-6 py-4">
              <span v-if="item.source_type === 'RVM'" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                <Truck :size="12" /> RVM
              </span>
              <span v-else-if="item.source_type === 'ON_DEMAND'" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
                <MapPin :size="12" /> On-Demand
              </span>
              <span v-else class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                Cleaning
              </span>
            </td>

            <td class="px-6 py-4">
              <span v-if="item.source_type === 'ON_DEMAND'" class="text-xs text-gray-600">
                {{ item.customer_address || '-' }}
              </span>
              <span v-else class="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">
                {{ item.device_no }}
              </span>
            </td>

            <td class="px-6 py-4">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                {{ item.waste_type }}
              </span>
            </td>

            <td class="px-6 py-4 text-center">
              <div class="flex items-center justify-center space-x-1">
                <Scale :size="16" class="text-amber-500" />
                <span class="text-lg font-bold text-gray-900">{{ item.bag_weight_collected }}</span>
                <span class="text-xs text-gray-500">kg</span>
              </div>
            </td>

            <td class="px-6 py-4">
               <div class="flex items-center text-sm text-gray-600">
                 <User :size="16" class="mr-2 text-gray-400" />
                 {{ item.cleaner_name }}
               </div>
            </td>

            <td class="px-6 py-4 text-center">
              <span v-if="item.status === 'VERIFIED'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                Verified
              </span>
              <span v-else-if="item.status === 'COLLECTED'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                Collected
              </span>
              <span v-else-if="item.status === 'ASSIGNED'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                Assigned
              </span>
              <span v-else-if="item.status === 'REJECTED'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                Rejected
              </span>
              <span v-else class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
                {{ item.status }}
              </span>
            </td>

            <td class="px-6 py-4 text-center">
              <button 
                v-if="item.status === 'COLLECTED' || item.status === 'ASSIGNED'"
                @click="openVerifyModal(item)"
                class="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-all shadow-sm"
              >
                Review
              </button>
              <div v-else class="flex justify-center">
                  <CheckCircle v-if="item.status === 'VERIFIED'" :size="20" class="text-green-400" />
                  <XCircle v-if="item.status === 'REJECTED'" :size="20" class="text-red-400" />
              </div>
            </td>

          </tr>
        </tbody>
      </table>
    </div>

    <CleaningVerificationModal 
        :isOpen="showModal"
        :record="selectedRecord"
        :isProcessing="isProcessing"
        @close="showModal = false"
        @approve="handleApprove"
        @reject="handleReject"
    />
    <ExportSummaryModal 
        :isOpen="showExportModal"
        :data="dataToExport"
        mode="cleaning" 
        @close="showExportModal = false"
    />
  </div>
</template>
