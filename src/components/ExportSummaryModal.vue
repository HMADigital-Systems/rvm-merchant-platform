<script setup lang="ts">
import { computed } from 'vue';
import { X, PieChart, FileSpreadsheet } from 'lucide-vue-next'; // ✅ Removed unused 'Download'
import { useExcelExport } from '../composables/useExcelExport';

const props = defineProps<{
  isOpen: boolean;
  data: any[];
}>();

const emit = defineEmits(['close']);
const { generateSummary, downloadExcel } = useExcelExport();

const stats = computed(() => generateSummary(props.data));

const percentages = computed(() => {
  const total = stats.value.totalCount || 1;
  // ✅ FIX: Access via string index and provide default 0 to fix 'possibly undefined' error
  const counts = stats.value.statusCounts;
  return {
    pending: ((counts['PENDING'] || 0) / total) * 100,
    approved: ((counts['APPROVED'] || 0) / total) * 100,
    rejected: ((counts['REJECTED'] || 0) / total) * 100
  };
});

const handleDownload = () => {
  downloadExcel(props.data, 'Withdrawals');
  emit('close');
};
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div @click="emit('close')" class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"></div>

    <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      
      <div class="bg-slate-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
        <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2">
          <PieChart :size="20" class="text-blue-600"/> Export Summary
        </h3>
        <button @click="emit('close')" class="p-1 hover:bg-gray-200 rounded-full transition-colors">
          <X :size="20" class="text-gray-500" />
        </button>
      </div>

      <div class="p-6 space-y-6">
        
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
            <div class="text-sm text-blue-600 font-semibold uppercase tracking-wider">Rows</div>
            <div class="text-3xl font-bold text-gray-900">{{ stats.totalCount }}</div>
          </div>
          <div class="bg-green-50 p-4 rounded-xl border border-green-100 text-center">
            <div class="text-sm text-green-600 font-semibold uppercase tracking-wider">Total Value</div>
            <div class="text-3xl font-bold text-gray-900">{{ stats.totalAmount.toLocaleString() }}</div>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Status Distribution</h4>
          
          <div class="h-4 w-full bg-gray-100 rounded-full flex overflow-hidden">
            <div class="bg-amber-400 h-full" :style="{ width: percentages.pending + '%' }" title="Pending"></div>
            <div class="bg-green-500 h-full" :style="{ width: percentages.approved + '%' }" title="Approved"></div>
            <div class="bg-red-500 h-full" :style="{ width: percentages.rejected + '%' }" title="Rejected"></div>
          </div>

          <div class="flex justify-between text-xs mt-2 text-gray-600">
            <div class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-amber-400"></div> Pending ({{ stats.statusCounts['PENDING'] || 0 }})</div>
            <div class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-green-500"></div> Paid ({{ stats.statusCounts['APPROVED'] || 0 }})</div>
            <div class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-red-500"></div> Rejected ({{ stats.statusCounts['REJECTED'] || 0 }})</div>
          </div>
        </div>

        <p class="text-xs text-gray-400 text-center italic">
          This export will include {{ stats.totalCount }} rows based on your current filters.
        </p>
      </div>

      <div class="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
        <button @click="emit('close')" class="flex-1 py-2.5 text-sm font-medium text-gray-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 rounded-xl transition-all">
          Cancel
        </button>
        <button @click="handleDownload" class="flex-1 py-2.5 text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 rounded-xl shadow-lg shadow-gray-200 flex items-center justify-center gap-2 transition-all">
          <FileSpreadsheet :size="18" /> Download Excel
        </button>
      </div>

    </div>
  </div>
</template>