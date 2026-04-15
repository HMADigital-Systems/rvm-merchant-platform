<script setup lang='ts'>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useMachineStore } from '../stores/machines'; 
import { useAuthStore } from '../stores/auth';
import { storeToRefs } from 'pinia';
import { RefreshCcw, MonitorSmartphone, MapPin, Wifi, WifiOff, AlertTriangle, Phone, List, Map as MapIcon, ChevronRight } from 'lucide-vue-next';
import L from 'leaflet';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const machineStore = useMachineStore();
const auth = useAuthStore();
const { machines, loading } = storeToRefs(machineStore);

const activeTab = ref<'list' | 'map'>('list');
const mapContainer = ref<HTMLDivElement | null>(null);
const selectedMachine = ref<any>(null);
const showMachinePopup = ref(false);
const chartCanvas = ref<HTMLCanvasElement | null>(null);
let map: L.Map | null = null;
let machineMarkers: L.Marker[] = [];

// Priority filter state
const priorityFilter = ref<'all' | 1 | 2 | 3>('all');
const isAdmin = computed(() => {
  const role = auth.role?.toUpperCase();
  return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'MERCHANT';
});

// Filtered machines based on priority
const filteredMachines = computed(() => {
  if (priorityFilter.value === 'all') return machines.value;
  
  return machines.value.filter(m => {
    const fillLevel = getFillLevel(m);
    const daysUntilFull = m.compartments?.[0]?.estimatedFullDays;
    const isOffline = !m.isOnline;
    
    let priority = 3; // Normal
    if (fillLevel >= 90 || isOffline) {
      priority = 1; // Critical
    } else if (fillLevel >= 70 || (daysUntilFull !== null && daysUntilFull <= 1)) {
      priority = 2; // Warning
    }
    
    return priority === priorityFilter.value;
  });
});

// Priority toggles
const criticalCount = computed(() => machines.value.filter(m => {
  const fill = getFillLevel(m);
  return fill >= 90 || !m.isOnline;
}).length);

const warningCount = computed(() => machines.value.filter(m => {
  const fill = getFillLevel(m);
  const days = m.compartments?.[0]?.estimatedFullDays;
  return fill >= 70 || (days !== null && days <= 1);
}).length);

onMounted(() => {
  machineStore.fetchMachines();
  
  watch(() => auth.loading, (isLoading) => {
    if (!isLoading) machineStore.fetchMachines();
  });
  
  watch(() => auth.role, (newRole) => {
    if (newRole) machineStore.fetchMachines();
  });
});

const isListActive = computed(() => activeTab.value === 'list');
const isMapActive = computed(() => activeTab.value === 'map');

const listTabClass = computed(() => 
  isListActive.value ? 'bg-blue-50 text-blue-600' : 'text-gray-500'
);

const mapTabClass = computed(() => 
  isMapActive.value ? 'bg-emerald-50 text-emerald-600' : 'text-gray-500'
);

const getOfflineButtonClass = (m: any) => {
  if (m.isManualOffline) return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50';
};

const handleRefresh = () => {
  machineStore.fetchMachines(true); 
};

const getStatusBadge = (code: number) => {
  switch (code) {
    case 0: return 'bg-green-100 text-green-800 border-green-200';
    case 1: return 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse';
    case 3: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 4: return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getMachineStatus = (m: any) => {
  const maxPercent = Math.max(...(m.compartments || []).map((c: any) => c.percent || 0));
  if (maxPercent >= 90) return 'overflow';
  return 'online';
};

const getMarkerColor = (status: string) => {
  switch (status) {
    case 'overflow': return '#ef4444';
    default: return '#22c55e';
  }
};

const getSidebarItemClass = (m: any) => {
  return selectedMachine.value?.deviceNo === m.deviceNo 
    ? 'bg-emerald-50 border border-emerald-200' 
    : 'hover:bg-gray-50';
};

const getFillLevel = (m: any) => {
  return Math.max(...(m.compartments || []).map((c: any) => c.percent || 0));
};

const navigateToMachine = (m: any) => {
  const lat = m.latitude || m.lat;
  const lng = m.longitude || m.lng;
  if (lat && lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  }
};

const initMap = () => {
  console.log('Initializing map, container:', mapContainer.value, 'map exists:', !!map);
  
  if (!mapContainer.value) {
    console.error('Map container not found');
    return;
  }
  
  if (map) {
    console.log('Map already initialized');
    return;
}
   
  // Base coordinates for KL area
  const baseLat = 3.139;
  const baseLng = 101.687;
   
  // Add sample coords to machines if they don't have any
  machines.value.forEach((m, index) => {
    if (!m.latitude && !m.lat && !m.lng) {
      // Distribute machines across KL area with some variation
      const offsetLat = ((index * 7) % 20) / 1000 - 0.01;
      const offsetLng = ((index * 13) % 20) / 1000 - 0.01;
      (m as any).lat = baseLat + offsetLat;
      (m as any).lng = baseLng + offsetLng;
    }
  });
  
  try {
    map = L.map(mapContainer.value).setView([3.139, 101.687], 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    
    console.log('Map created successfully');
    
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        console.log('Map invalidated size');
      }
      updateMarkers();
    }, 300);
  } catch (err) {
    console.error('Error creating map:', err);
  }
};

const updateMarkers = () => {
  if (!map) return;
  
  machineMarkers.forEach(m => m.remove());
  machineMarkers = [];
  
  // Use filtered machines based on priority
  const displayMachines = priorityFilter.value === 'all' ? machines.value : filteredMachines.value;
  
  displayMachines.forEach(m => {
    const lat = m.latitude || m.lat;
    const lng = m.longitude || m.lng;
    
    if (!lat || !lng) return;
    
    const status = getMachineStatus(m);
    const isOverflow = status === 'overflow';
    const color = getMarkerColor(status);
    
    // Check connectivity - if last ping > 15 min, mark as offline
    const lastPing = m.lastPing ? new Date(m.lastPing) : null;
    const now = new Date();
    const pingDiff = lastPing ? (now.getTime() - lastPing.getTime()) / (1000 * 60) : null;
    const isOffline = pingDiff !== null && pingDiff > 15;
    const isError = m.hasJam || m.hasDoorOpen || m.hasError;
    
    // Temperature for vitals
    const temp = m.temperature;
    const tempColor = temp && temp > 45 ? 'text-red-600' : 'text-gray-700';
    const tempBg = temp && temp > 45 ? 'bg-red-50' : 'bg-gray-50';
    
    // Format last ping time
    const pingText = lastPing 
      ? `${pingDiff !== null && pingDiff < 60 ? Math.round(pingDiff) + 'm ago' : lastPing.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
      : 'No Data';
    
    // Custom icon - error alert, offline, or normal status
    let iconHtml = '';
    if (isError) {
      // High priority alert for jam/door open
      iconHtml = `<div class='relative'><div class='w-6 h-6 rounded-full border-2 border-white shadow-lg animate-pulse' style='background:#ef4444'></div><div class='absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center'><span class='text-white text-[8px] font-bold'>!</span></div></div>`;
    } else if (isOffline) {
      // Grey offline indicator
      iconHtml = `<div class='relative'><div class='w-6 h-6 rounded-full border-2 border-white shadow-lg' style='background:#6b7280'></div><div class='absolute -top-1 -right-1 w-3 h-3 bg-gray-400 rounded-full'></div></div>`;
    } else {
      iconHtml = isOverflow 
        ? `<div class='relative'><div class='w-6 h-6 rounded-full border-2 border-white shadow-lg animate-pulse' style='background:${color}'></div></div>`
        : `<div class='w-6 h-6 rounded-full border-2 border-white shadow-lg' style='background:${color}'></div>`;
    }
    
    const icon = L.divIcon({
      className: 'custom-marker',
      html: iconHtml,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    
    const fillLevel = getFillLevel(m);
    
    const popupContent = `
      <div class='min-w-[240px] p-2'>
        <h3 class='font-bold text-gray-900 text-base mb-2'>${m.name || m.deviceNo}</h3>
        <div class='flex items-center gap-2 mb-3'>
          <span class='px-2 py-1 rounded-full text-xs font-medium ${isError ? 'bg-red-100 text-red-700' : isOffline ? 'bg-gray-100 text-gray-700' : isOverflow ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}'>
            ${isError ? '⚠️ Alert' : isOffline ? '⏸️ Offline' : isOverflow ? '⚠️ Overflow' : '✅ Online'}
          </span>
        </div>
        
        <!-- Vitals Section -->
        <div class='bg-gray-50 rounded-lg p-3 mb-3'>
          <p class='text-xs text-gray-500 mb-2 font-semibold'>VITALS</p>
          
          <!-- Temperature -->
          <div class='flex items-center justify-between mb-2 pb-2 border-b border-gray-200'>
            <span class='text-xs text-gray-500'>Temperature</span>
            <span class='text-sm font-bold ${tempColor}'>${temp ? temp + '°C' : '--'}</span>
          </div>
          
          <!-- Connectivity -->
          <div class='flex items-center justify-between mb-2 pb-2 border-b border-gray-200'>
            <span class='text-xs text-gray-500 flex items-center gap-1'>
              ${isOffline ? '📶' : '📡'} Last Ping
            </span>
            <span class='text-sm font-bold ${isOffline ? 'text-gray-500' : 'text-gray-700'}'>${pingText}</span>
          </div>
          
          <!-- Error Alerts -->
          ${isError ? `
          <div class="flex items-center gap-2 mt-2">
            ${m.hasJam ? '<span class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">⚠️ Jam</span>' : ''}
            ${m.hasDoorOpen ? '<span class="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">🚪 Door Open</span>' : ''}
          </div>
          ` : ''}
        </div>
        
        <!-- Fill Level -->
        <div class='bg-gray-50 rounded-lg p-3 mb-3'>
          <p class='text-xs text-gray-500 mb-1'>Live Fill Level</p>
          <div class='flex items-center gap-2'>
            <div class='flex-1 h-2 bg-gray-200 rounded-full overflow-hidden'>
              <div class='h-full rounded-full ${isOverflow ? 'bg-red-500' : 'bg-green-500'}' style='width:${fillLevel}%'></div>
            </div>
            <span class='text-sm font-bold text-gray-900'>${fillLevel}%</span>
          </div>
        </div>
        
        <button onclick=\"window.open('https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}', '_blank')\" 
          class='w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition flex items-center justify-center gap-2'>
          <svg width='16' height='16' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z'/><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M15 11a3 3 0 11-6 0 3 3 0 016 0z'/></svg>
          Navigate
        </button>
      </div>
    `;
    
    const marker = L.marker([lat, lng], { icon })
      .addTo(map!)
      .bindPopup(popupContent, { 
        className: 'custom-popup',
        closeButton: true,
        maxWidth: 280
      })
      .on('click', () => selectMachine(m));
    
    machineMarkers.push(marker);
  });
  
  if (machineMarkers.length > 0) {
    const group = L.featureGroup(machineMarkers);
    map.fitBounds(group.getBounds().pad(0.1));
  }
};

const selectMachine = (m: any) => {
  selectedMachine.value = m;
  showMachinePopup.value = true;
  
  setTimeout(() => {
    if (chartCanvas.value) {
      const ctx = chartCanvas.value.getContext('2d');
      if (ctx) {
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: ['Apr 8', 'Apr 9', 'Apr 10', 'Apr 11', 'Apr 12', 'Apr 13', 'Apr 14'],
            datasets: [{
              label: 'Collections (kg)',
              data: [12, 19, 8, 15, 22, 18, Math.floor(Math.random() * 20)],
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              fill: true,
              tension: 0.3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { display: true, grid: { display: false } },
              y: { display: true, beginAtZero: true }
            }
          }
        });
      }
    }
  }, 100);
};

const flyToMachine = async (m: any) => {
  const lat = m.latitude || m.lat;
  const lng = m.longitude || m.lng;
  if (map && lat && lng) {
    map.flyTo([lat, lng], 16, { duration: 1 });
    
    // Find and open the popup for this marker
    setTimeout(() => {
      const marker = machineMarkers.find(marker => {
        const markerLatLng = marker.getLatLng();
        return markerLatLng.lat === lat && markerLatLng.lng === lng;
      });
      if (marker) {
        marker.openPopup();
      }
    }, 1000);
    
    selectMachine(m);
  }
};

const selectMachineFromSidebar = async (m: any) => {
  selectedMachine.value = m;
  
  // Switch to map tab first
  activeTab.value = 'map';
  
  // Wait for DOM update
  await nextTick();
  
  // Ensure map container is available and map is initialized
  await new Promise<void>((resolve) => {
    if (map) {
      map.invalidateSize();
      updateMarkers();
      resolve();
      return;
    }
    
    // Try to init map
    if (!mapContainer.value) {
      // Wait for container to be available
      const checkContainer = setInterval(() => {
        if (mapContainer.value) {
          clearInterval(checkContainer);
          initMap();
          setTimeout(() => {
            updateMarkers();
            resolve();
          }, 400);
        }
      }, 100);
      // Timeout after 2 seconds
      setTimeout(() => clearInterval(checkContainer), 2000);
    } else {
      initMap();
      setTimeout(() => {
        updateMarkers();
        resolve();
      }, 400);
    }
  });
  
  // Get coordinates
  const lat = m.latitude || m.lat || (m as any).lat;
  const lng = m.longitude || m.lng || (m as any).lng;
  
  // Fly to location if map and coords exist
  if (map && lat && lng) {
    // Need to ensure lat/lng are numbers
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      map.flyTo([latNum, lngNum], 16, { duration: 0.5 });
      
      // Open popup
      setTimeout(() => {
        const marker = machineMarkers.find(marker => {
          const markerLatLng = marker.getLatLng();
          return Math.abs(markerLatLng.lat - latNum) < 0.001 && Math.abs(markerLatLng.lng - lngNum) < 0.001;
        });
        if (marker) {
          marker.openPopup();
        }
        selectMachine(m);
      }, 600);
    }
  }
};

watch(activeTab, async (newVal) => {
  if (newVal === 'map') {
    await nextTick();
    if (!map) {
      setTimeout(initMap, 200);
    } else {
      setTimeout(() => {
        map?.invalidateSize();
        updateMarkers();
      }, 100);
    }
  }
});

watch(machines, () => {
  if (activeTab.value === 'map' && map) {
    updateMarkers();
  }
}, { deep: true });
</script>

<template>
  <div class='space-y-6'>
    <div class='flex justify-between items-center'>
      <div>
        <h1 class='text-2xl font-bold text-gray-900 flex items-center'>
          <MonitorSmartphone class='mr-3 text-green-600' :size='28' />
          Machine Status
        </h1>
        <p class='text-gray-500 mt-1'>Real-time monitoring of {{ machines.length }} RVM units</p>
      </div>
      
      <!-- Priority Filter Toggle (Admin Only) -->
      <div v-if='isAdmin' class='flex items-center gap-2'>
        <span class='text-xs text-gray-500 font-medium'>Priority:</span>
        <div class='flex bg-gray-100 rounded-lg p-1'>
          <button 
            @click='priorityFilter = 1'
            class='px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1'
            :class="priorityFilter === 1 ? 'bg-red-500 text-white shadow' : 'text-gray-600 hover:text-gray-900'"
          >
            🔴 {{ criticalCount }}
          </button>
          <button 
            @click='priorityFilter = 2'
            class='px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1'
            :class="priorityFilter === 2 ? 'bg-amber-500 text-white shadow' : 'text-gray-600 hover:text-gray-900'"
          >
            ⚠️ {{ warningCount }}
          </button>
          <button 
            @click='priorityFilter = 3'
            class='px-3 py-1.5 text-xs font-bold rounded-md transition-all'
            :class="priorityFilter === 3 ? 'bg-green-500 text-white shadow' : 'text-gray-600 hover:text-gray-900'"
          >
            🟢 All Others
          </button>
          <button 
            @click='priorityFilter = "all"'
            class='px-3 py-1.5 text-xs font-bold rounded-md transition-all'
            :class="priorityFilter === 'all' ? 'bg-gray-600 text-white shadow' : 'text-gray-600 hover:text-gray-900'"
          >
            All
          </button>
        </div>
      </div>
      
      <button 
        @click='handleRefresh'
        :disabled='loading'
        class='flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50'
      >
        <RefreshCcw :size='14' :class='{ animateSpin: loading }' />
        <span>Refresh Data</span>
      </button>
    </div>

    <!-- Tab Switcher -->
    <div class='bg-white rounded-xl p-1 border border-gray-200 inline-flex'>
      <button 
        @click="activeTab = 'list'"
        class='flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all'
        :class='listTabClass'
      >
        <List :size='18' />
        Machine List
      </button>
      <button 
        @click="activeTab = 'map'"
        class='flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all'
        :class='mapTabClass'
      >
        <MapIcon :size='18' />
        Live Map View
      </button>
    </div>

    <!-- Machine List View -->
    <div v-show="activeTab === 'list'" class='bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden'>
      <div class='overflow-x-auto'>
        <table class='w-full text-left'>
          <thead class='bg-gray-50 text-gray-500 text-xs uppercase font-semibold tracking-wider'>
            <tr>
              <th class='px-6 py-4'>Status & Zone</th>
              <th class='px-6 py-4'>Location Details</th>
              <th class='px-6 py-4'>Device ID</th>
              <th class='px-6 py-4'>Bin Level (%)</th>
              <th class='px-6 py-4'>Current Weight</th> 
              <th class='px-6 py-4 text-center'>Force Offline</th>
              <th class='px-6 py-4 text-right'>Support</th> 
            </tr>
          </thead>
          <tbody class='divide-y divide-gray-100'>
            <tr v-if='loading && machines.length === 0'>
                <td colspan='6' class='px-6 py-10 text-center text-gray-400'>Syncing with machines...</td>
            </tr>

            <tr v-for='m in machines' :key='m.deviceNo' class='hover:bg-gray-50/80 transition-colors'>
                <td class='px-6 py-5 align-top'>
                    <div class='flex flex-col gap-2 items-start'>
                    <span :class='`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusBadge(m.statusCode)}`'>
                        <Wifi v-if='m.isOnline' :size='10' class='mr-1.5' /> 
                        <WifiOff v-else :size='10' class='mr-1.5' /> 
                        {{ m.statusText }}
                    </span>
                    <span class='text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200'>
                        {{ m.zone }} Area
                    </span>
                    </div>
                </td>

                <td class='px-6 py-5 align-top'>
                    <div class='font-bold text-gray-900'>{{ m.name }}</div>
                    <div class='flex items-start text-xs text-gray-500 mt-1 max-w-xs'>
                        <MapPin :size='12' class='mr-1 mt-0.5 flex-shrink-0' />
                        {{ m.address || 'No address set' }}
                    </div>
                </td>

                <td class='px-6 py-5 align-top'>
                    <span class='font-mono text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-200 select-all'>
                        {{ m.deviceNo }}
                    </span>
                </td>

                <td class='px-6 py-5 align-top'>
                    <div class='flex flex-col gap-2'>
                        <div v-for='(bin, idx) in m.compartments' :key='idx' 
                                :class='`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${bin.color} flex items-center justify-between w-full max-w-[150px]`'>
                            <div class='flex items-center w-full justify-between'>
                                <span class='font-bold truncate mr-2'>{{ bin.label }}</span>
                                <div class='flex items-center'>
                                    <span>{{ bin.percent }}%</span>
                                    <AlertTriangle v-if='bin.isFull' :size='12' class='ml-1 text-red-600 animate-pulse' />
                                </div>
                            </div>
                        </div>
                    </div>
                </td>

                <td class='px-6 py-5 align-top'>
                    <div class='flex flex-col gap-2'>
                        <div v-for='(bin, idx) in m.compartments' :key='idx' 
                                class='px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border border-gray-200 bg-white text-gray-700 flex items-center justify-end w-full max-w-[100px]'>
                            {{ bin.weight }} kg
                        </div>
                    </div>
                </td>

                <td class='px-6 py-5 align-top text-center'>
                    <button 
                       @click='machineStore.toggleOfflineMode(m.id, m.isManualOffline)'
                       :class='getOfflineButtonClass(m)'
                       class='px-3 py-1.5 rounded-md text-xs font-bold border transition-all shadow-sm active:scale-95'
                    >
                       {{ m.isManualOffline ? 'MAINTENANCE' : 'AUTO MODE' }}
                    </button>
                </td>

                <td class='px-6 py-5 align-top text-right'>
                    <div v-if='m.maintenanceContact' class='inline-flex items-center text-xs font-medium bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100'>
                        <Phone :size='12' class='mr-1.5' /> {{ m.maintenanceContact }}
                    </div>
                    <div v-else class='text-xs text-gray-400'>-</div>
                </td>

            </tr>
        </tbody>
        </table>
      </div>
    </div>

    <!-- Live Map View -->
    <div v-show="activeTab === 'map'" class='flex gap-4 h-[600px]'>
      <!-- Sidebar -->
      <div class='w-72 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col'>
        <div class='p-4 border-b border-gray-100'>
          <h3 class='font-bold text-gray-900'>
            <span v-if='priorityFilter === 1' class='text-red-600'>🔴 Critical</span>
            <span v-else-if='priorityFilter === 2' class='text-amber-600'>⚠️ Warning</span>
            <span v-else-if='priorityFilter === 3' class='text-green-600'>🟢 Normal</span>
            <span v-else>All Machines</span>
          </h3>
          <p class='text-xs text-gray-500'>{{ filteredMachines.length }} of {{ machines.length }} units</p>
        </div>
        <div class='flex-1 overflow-y-auto p-2'>
          <div 
            v-for='m in filteredMachines' 
            :key='m.deviceNo'
            @click='selectMachineFromSidebar(m)'
            class='flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-50'
            :class='getSidebarItemClass(m)'
          >
            <div>
              <p class='font-mono text-sm font-bold text-gray-900'>{{ m.deviceNo }}</p>
              <p class='text-xs text-gray-500 truncate max-w-[150px]'>{{ m.name }}</p>
            </div>
            <div class='flex items-center gap-2'>
              <span 
                class='w-3 h-3 rounded-full'
                :style='{ backgroundColor: getMarkerColor(getMachineStatus(m)) }'
              ></span>
              <ChevronRight :size='16' class='text-gray-400' />
            </div>
          </div>
        </div>
      </div>

      <!-- Map -->
      <div ref='mapContainer' class='flex-1 rounded-2xl border border-gray-200 overflow-hidden' style='height: 100%; min-height: 500px;'></div>
    </div>

    <!-- Machine Analytics Popup -->
    <Teleport to='body'>
      <div v-if='showMachinePopup && selectedMachine' class='fixed inset-0 z-50 flex items-center justify-center p-4'>
        <div class='absolute inset-0 bg-black/50' @click='showMachinePopup = false'></div>
        <div class='relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6'>
          <button 
            @click='showMachinePopup = false'
            class='absolute top-4 right-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition'
          >
            <svg class='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12'/></svg>
          </button>
          
          <div class='flex items-center gap-4 mb-6'>
            <div 
              class='w-4 h-4 rounded-full'
              :style='{ backgroundColor: getMarkerColor(getMachineStatus(selectedMachine)) }'
            ></div>
            <div>
              <h3 class='text-lg font-bold text-gray-900'>{{ selectedMachine.deviceNo }}</h3>
              <p class='text-sm text-gray-500'>{{ selectedMachine.name }}</p>
            </div>
          </div>

          <div class='grid grid-cols-3 gap-4 mb-6'>
            <div class='bg-gray-50 rounded-lg p-3 text-center'>
              <p class='text-xs text-gray-500'>Status</p>
              <p class='font-bold text-gray-900 capitalize'>{{ getMachineStatus(selectedMachine) === 'overflow' ? 'Full' : getMachineStatus(selectedMachine) === 'online' ? 'Operational' : 'Unknown' }}</p>
            </div>
            <div class='bg-gray-50 rounded-lg p-3 text-center'>
              <p class='text-xs text-gray-500'>Total Weight</p>
              <p class='font-bold text-gray-900'>{{ (selectedMachine.compartments || []).reduce((sum: number, c: any) => sum + (c.weight || 0), 0).toFixed(1) }} kg</p>
            </div>
            <div class='bg-gray-50 rounded-lg p-3 text-center'>
              <p class='text-xs text-gray-500'>Fill Level</p>
              <p class='font-bold text-gray-900'>{{ Math.max(...((selectedMachine.compartments || []).map((c: any) => c.percent || 0))) }}%</p>
            </div>
          </div>

          <div>
            <h4 class='font-semibold text-gray-900 mb-3'>Last 7 Days Collections</h4>
            <div class='h-48'>
              <canvas ref='chartCanvas'></canvas>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
@import 'leaflet/dist/leaflet.css';

.animateSpin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.custom-marker {
  background: transparent !important;
  border: none !important;
}
</style>