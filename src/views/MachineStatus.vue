<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getNearbyRVMs } from '../services/autogcm'; // Fix: Correct function name
import type { Machine } from '../types'; // Fix: type-only import
import { RefreshCcw, MonitorSmartphone, MapPin, Wifi, WifiOff } from 'lucide-vue-next';

const machines = ref<Machine[]>([]);
const loading = ref(true);

const fetchMachines = async () => {
  loading.value = true;
  // Using default coordinates for Kuala Lumpur
  const data = await getNearbyRVMs(3.14, 101.68);
  machines.value = data;
  loading.value = false;
};

onMounted(() => {
  fetchMachines();
});

const getStatusBadgeClass = (status: number) => {
  switch (status) {
    case 0: return 'bg-green-100 text-green-800';
    case 1: return 'bg-blue-100 text-blue-800 animate-pulse';
    case 2: return 'bg-gray-100 text-gray-800';
    case 3: return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getStatusLabel = (status: number) => {
  switch (status) {
    case 0: return 'Idle';
    case 1: return 'In Use';
    case 2: return 'Disabled';
    case 3: return 'Fault';
    default: return 'Unknown';
  }
};
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
         <h1 class="text-2xl font-bold text-gray-900 flex items-center">
           <MonitorSmartphone class="mr-3 text-green-600" :size="28" />
           Machine Status
         </h1>
         <p class="text-gray-500 mt-1">Real-time monitoring of RVM units</p>
      </div>
      <button 
        @click="fetchMachines"
        :disabled="loading"
        class="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50"
      >
        <RefreshCcw :size="14" :class="{ 'animate-spin': loading }" />
        <span>Refresh Data</span>
      </button>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold tracking-wider">
            <tr>
              <th class="px-8 py-4">Online</th>
              <th class="px-8 py-4">Device Info</th>
              <th class="px-8 py-4">Location</th>
              <th class="px-8 py-4">Operational Status</th>
              <th class="px-8 py-4 text-right">ID</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="loading && machines.length === 0">
               <td colspan="5" class="px-8 py-10 text-center text-gray-400">Loading machine data...</td>
            </tr>
            
            <tr v-if="!loading && machines.length === 0">
               <td colspan="5" class="px-8 py-10 text-center text-gray-400">No machines found in this area.</td>
            </tr>

            <tr v-for="m in machines" :key="m.id || m.deviceNo" class="hover:bg-gray-50/80 transition-colors">
              <td class="px-8 py-5">
                 <div class="flex items-center">
                    <div v-if="m.isOnline === 1" class="flex items-center text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                        <Wifi :size="14" class="mr-1.5" />
                        <span class="text-xs font-bold">Online</span>
                    </div>
                    <div v-else class="flex items-center text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-100">
                        <WifiOff :size="14" class="mr-1.5" />
                        <span class="text-xs font-bold">Offline</span>
                    </div>
                 </div>
              </td>
              <td class="px-8 py-5">
                <div class="font-bold text-gray-900">{{ m.deviceName || 'RVM Unit' }}</div>
                <div class="text-xs text-gray-400 font-mono mt-1">{{ m.deviceNo }}</div>
              </td>
              <td class="px-8 py-5">
                <div class="flex items-start text-sm text-gray-600 max-w-xs">
                    <MapPin :size="14" class="mr-1.5 mt-0.5 flex-shrink-0 text-gray-400" />
                    {{ m.address }}
                </div>
              </td>
              <td class="px-8 py-5">
                <span :class="`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(m.status)}`">
                  {{ getStatusLabel(m.status) }}
                </span>
              </td>
              <td class="px-8 py-5 text-right text-xs text-gray-400 font-mono">
                {{ m.id }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>