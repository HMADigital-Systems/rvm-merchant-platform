<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import 'leaflet/dist/leaflet.css';
import { LMap, LTileLayer, LCircleMarker, LPopup } from '@vue-leaflet/vue-leaflet';
import L from 'leaflet';
import { useMapStats, type MachineStats } from '../composables/useMapStats';
import { useRouter } from 'vue-router';
import { Activity, Scale, Users, TrendingUp, Clock, Calendar, Star, AlertTriangle, Flame, Layers, Thermometer, Recycle, ArrowRight } from 'lucide-vue-next';

interface EfficiencyData {
  deviceNo: string;
  name: string;
  lat: number;
  lng: number;
  totalWeight: number;
  totalPoints: number;
  submissionCount: number;
  efficiencyRatio: number;
  performance: 'gold' | 'warning' | 'normal';
}

const router = useRouter();

const props = defineProps<{ 
  machines: any[];
  efficiencyStats?: EfficiencyData[];
}>();
const emit = defineEmits<{
  (e: 'flyTo', lat: number, lng: number): void;
  (e: 'newSubmission', data: { machineId: string; lat: number; lng: number }): void;
}>();

const navigateToReports = (machineId: string) => {
  router.push(`/reports?machine=${machineId}`);
};

const zoom = ref(6);
const center = ref<[number, number]>([4.2105, 101.9758]);

const { globalTotals, fetchMachineStats, fetchGlobalTotals, statsLoading } = useMapStats();

// Heatmap mode toggle
const showHeatmap = ref(false);

// Map efficiency data by deviceNo for quick lookup
const efficiencyMap = computed(() => {
  const map: Record<string, EfficiencyData> = {};
  if (props.efficiencyStats) {
    props.efficiencyStats.forEach(e => {
      map[e.deviceNo] = e;
    });
  }
  return map;
});

// Selected machine for stats
const selectedMachineId = ref<string>('');
const selectedMachineStats = ref<MachineStats | null>(null);
const activeTimeframe = ref<'day' | 'week' | 'month'>('day');

const resetCenter = () => {
  zoom.value = 6;
  center.value = [4.2105, 101.9758];
};

const getPerformanceColor = (machine: any): string => {
  const eff = efficiencyMap.value[machine.device_no];
  if (!eff) return '#6b7280'; // default gray
  
  if (eff.performance === 'gold') return '#f59e0b'; // gold
  if (eff.performance === 'warning') return '#ef4444'; // red warning
  return '#16a34a'; // green normal
};

const getPerformanceBg = (machine: any): string => {
  const eff = efficiencyMap.value[machine.device_no];
  if (!eff) return '#9ca3af';
  
  if (eff.performance === 'gold') return '#fcd34d';
  if (eff.performance === 'warning') return '#fca5a5';
  return '#22c55e';
};

const getHeatmapColor = (machine: any): string => {
  const eff = efficiencyMap.value[machine.device_no];
  if (!eff) return '#9ca3af';
  
  // Gradient: green (efficient/low pts/kg) -> yellow -> red (inefficient/high pts/kg)
  const ratio = eff.efficiencyRatio;
  if (ratio < 3) return '#22c55e'; // green - very efficient
  if (ratio < 8) return '#84cc16'; // lime
  if (ratio < 12) return '#eab308'; // yellow
  if (ratio < 20) return '#f97316'; // orange
  return '#ef4444'; // red - inefficient
};

const clusteredMachines = computed(() => {
  const groups: Record<string, any[]> = {};

  props.machines.forEach(m => {
    const lat = m.latitude ? Number(m.latitude).toFixed(4) : '0';
    const lng = m.longitude ? Number(m.longitude).toFixed(4) : '0';
    
    if (lat === '0' || lng === '0') return;

    const key = `${lat},${lng}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });

  return Object.values(groups).map(group => {
    const isOnline = group.some(m => 
        m.is_active === true || 
        m.is_online === true || 
        m.isOnline === true || 
        String(m.status).toUpperCase() === 'ONLINE'
    );
    
    const hasError = group.some(m => 
        m.hasJam === true || 
        m.hasDoorOpen === true ||
        m.hasError === true ||
        m.jam === true ||
        m.doorOpen === true
    );

    const firstMachine = group[0];
    const eff = efficiencyMap.value[firstMachine.device_no];
    const performance = eff?.performance || 'normal';

    return {
        id: group[0].id, 
        deviceNo: group[0].device_no,
        lat: Number(group[0].latitude),
        lng: Number(group[0].longitude),
        name: group[0].name || group[0].location_name,
        machines: group,
        isOnline,
        hasError,
        performance,
        efficiencyRatio: eff?.efficiencyRatio || 0,
        totalWeight: eff?.totalWeight || 0,
        totalPoints: eff?.totalPoints || 0
    };
  });
});

const handleMarkerClick = async (machine: any) => {
  if (!machine.deviceNo) return;
  
  selectedMachineId.value = machine.deviceNo;
  selectedMachineStats.value = null;
  
  const stats = await fetchMachineStats(machine.deviceNo);
  selectedMachineStats.value = stats;
};

const currentStats = computed(() => {
  if (!selectedMachineStats.value) return null;
  
  const s = selectedMachineStats.value;
  switch (activeTimeframe.value) {
    case 'day': return s.day;
    case 'week': return s.week;
    case 'month': return s.month;
    default: return s.day;
  }
});

const hourlyChartData = computed(() => {
  if (!selectedMachineStats.value) return [];
  return selectedMachineStats.value.hourlyBreakdown.slice(-12).map((h, i) => ({
    hour: h.hour,
    label: `${h.hour}:00`,
    value: h.weight,
    max: Math.max(...selectedMachineStats.value!.hourlyBreakdown.map(x => x.weight), 1)
  }));
});

const formatWeight = (w: number) => {
  if (w >= 1000) return `${(w / 1000).toFixed(1)}k`;
  return w.toFixed(1);
};

onMounted(() => {
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
    iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
    shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
  });
  
  fetchGlobalTotals();
});
</script>

<template>
  <div class="h-full w-full relative z-0">
    <!-- Global Summary Card Overlay -->
    <div class="absolute top-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border border-slate-200 p-4 w-56">
      <div class="flex items-center gap-2 mb-3">
        <Activity :size="16" class="text-blue-600" />
        <span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Network Summary</span>
      </div>
      
      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <span class="text-xs text-slate-500">Today</span>
          <div class="text-right">
            <span class="text-sm font-bold text-slate-800">{{ globalTotals.todayWeight }}kg</span>
            <span class="text-xs text-slate-400 ml-1">{{ globalTotals.todaySubmissions }} subm</span>
          </div>
        </div>
        
        <div class="flex justify-between items-center">
          <span class="text-xs text-slate-500">This Week</span>
          <div class="text-right">
            <span class="text-sm font-bold text-slate-800">{{ globalTotals.weekWeight }}kg</span>
            <span class="text-xs text-slate-400 ml-1">{{ globalTotals.weekSubmissions }} subm</span>
          </div>
        </div>
        
        <div class="h-px bg-slate-200 my-2"></div>
        
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-1">
            <Scale :size="12" class="text-emerald-600" />
            <span class="text-xs text-slate-500">Total Volume</span>
          </div>
          <span class="text-sm font-bold text-emerald-600">{{ globalTotals.totalWeight }}kg</span>
        </div>
        
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-1">
            <Users :size="12" class="text-blue-600" />
            <span class="text-xs text-slate-500">Total Users</span>
          </div>
          <span class="text-sm font-bold text-blue-600">{{ globalTotals.totalUsers }}</span>
        </div>
        
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-1">
            <TrendingUp :size="12" class="text-purple-600" />
            <span class="text-xs text-slate-500">Submissions</span>
          </div>
          <span class="text-sm font-bold text-purple-600">{{ globalTotals.totalSubmissions }}</span>
        </div>
      </div>
    </div>

    <!-- Heatmap Toggle & Reset Buttons -->
    <div class="absolute bottom-4 right-4 z-[1000] flex gap-2">
      <button 
        v-if="efficiencyStats && efficiencyStats.length > 0"
        @click="showHeatmap = !showHeatmap"
        :class="[
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg shadow-md border transition-colors',
          showHeatmap 
            ? 'bg-orange-500 text-white border-orange-600' 
            : 'bg-white/95 text-slate-600 border-slate-200 hover:bg-slate-50'
        ]"
      >
        <Flame :size="14" />
        {{ showHeatmap ? 'Exit Heatmap' : 'Efficiency Heatmap' }}
      </button>
      
      <button 
        @click="resetCenter"
        class="bg-white/95 backdrop-blur-sm rounded-lg shadow-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
      >
        Reset View
      </button>
    </div>
    
    <l-map 
      v-model:zoom="zoom" 
      :center="center" 
      :use-global-leaflet="false"
      @click="(e: any) => { if (e.latlng) center = [e.latlng.lat, e.latlng.lng] }"
    >
      <l-tile-layer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        layer-type="base"
        name="Clean Map"
        attribution="&copy; OpenStreetMap"
      ></l-tile-layer>

      <l-circle-marker
        v-for="cluster in clusteredMachines"
        :key="cluster.id"
        :lat-lng="[cluster.lat, cluster.lng]" 
        :radius="showHeatmap ? 10 + (cluster.machines.length * 2) : 6 + (cluster.machines.length * 1.5)" 
        :color="showHeatmap ? getHeatmapColor(cluster) : (cluster.hasError ? '#dc2626' : cluster.isOnline ? getPerformanceColor(cluster) : '#6b7280')"
        :fill-color="showHeatmap ? getHeatmapColor(cluster) : (cluster.hasError ? '#ef4444' : cluster.isOnline ? getPerformanceBg(cluster) : '#9ca3af')"
        :fill-opacity="showHeatmap ? 0.7 : 0.8"
        :weight="showHeatmap ? 3 : 2"
        @click="handleMarkerClick(cluster)"
      >
        <l-popup>
          <div class="machine-performance-card min-w-[260px]">
            <!-- Header Section -->
            <div class="card-header">
              <div class="flex-1">
                <div class="machine-name">{{ cluster.name || `RVM-${cluster.deviceNo}` }}</div>
                <div class="machine-id">ID: {{ cluster.deviceNo }}</div>
              </div>
              <div class="status-badge" :class="cluster.isOnline ? 'online' : 'offline'">
                <span class="status-dot"></span>
                <span class="status-text">{{ cluster.isOnline ? 'Online' : 'Offline' }}</span>
              </div>
            </div>

            <!-- Metrics Grid 2x2 -->
            <div class="metrics-grid">
              <!-- Fill Level -->
              <div class="metric-cell">
                <div class="metric-label">Fill Level</div>
                <div class="metric-value">{{ cluster.machines[0]?.compartments?.[0]?.percent || 0 }}%</div>
                <div class="fill-bar">
                  <div class="fill-progress" :style="{ width: (cluster.machines[0]?.compartments?.[0]?.percent || 0) + '%' }"></div>
                </div>
              </div>
              
              <!-- Current Weight -->
              <div class="metric-cell">
                <div class="metric-label">Current Weight</div>
                <div class="metric-value weight">{{ cluster.machines[0]?.compartments?.[0]?.weight || 0 }} <span class="unit">KG</span></div>
              </div>
              
              <!-- CO2 Saved -->
              <div class="metric-cell">
                <div class="metric-label">CO2 Saved</div>
                <div class="metric-value co2">{{ (cluster.totalWeight * 0.5).toFixed(1) }} <span class="unit">kg</span></div>
              </div>
              
              <!-- Temperature -->
              <div class="metric-cell">
                <div class="metric-label">Temperature</div>
                <div class="metric-value temp" :class="{ 'hot': (cluster.machines[0]?.temperature || 0) > 45 }">
                  {{ cluster.machines[0]?.temperature || '--' }}<span class="unit">°C</span>
                </div>
              </div>
            </div>

            <!-- Live Feed Snippet -->
            <div class="live-feed" v-if="selectedMachineId === cluster.deviceNo && currentStats">
              <div class="feed-label">Last Submission</div>
              <div class="feed-content">
                <Recycle :size="14" class="feed-icon" />
                <span class="feed-user">Recent Activity</span>
                <span class="feed-material">{{ currentStats.submissions }} submissions today</span>
              </div>
            </div>

            <!-- Action Button -->
            <button 
              class="action-button"
              @click.stop="navigateToReports(cluster.deviceNo)"
            >
              <span>View Full Analytics</span>
              <ArrowRight :size="14" />
            </button>
          </div>
        </l-popup>
      </l-circle-marker>
    </l-map>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

/* Machine Performance Card Styles */
.machine-performance-card {
  background: rgba(0, 20, 40, 0.85);
  border: 1px solid #10b981;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(16, 185, 129, 0.3);
}

.machine-name {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.machine-id {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  font-family: monospace;
  margin-top: 2px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
}

.status-badge.online {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.status-badge.offline {
  background: rgba(107, 114, 128, 0.2);
  color: #9ca3af;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-badge.online .status-dot {
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
  animation: pulse-glow 2s infinite;
}

.status-badge.offline .status-dot {
  background: #6b7280;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.metric-cell {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 8px;
}

.metric-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  margin-bottom: 2px;
}

.metric-value {
  font-size: 16px;
  font-weight: 700;
  color: #10b981;
}

.metric-value .unit {
  font-size: 10px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
}

.metric-value.weight {
  color: #10b981;
}

.metric-value.co2 {
  color: #06b6d4;
}

.metric-value.temp {
  color: #10b981;
}

.metric-value.temp.hot {
  color: #ef4444;
}

/* Fill Bar */
.fill-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  margin-top: 4px;
  overflow: hidden;
}

.fill-progress {
  height: 100%;
  background: linear-gradient(90deg, #10b981, #34d399);
  border-radius: 2px;
  transition: width 0.3s ease;
}

/* Live Feed */
.live-feed {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  padding: 8px;
}

.feed-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.feed-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.feed-icon {
  color: #10b981;
}

.feed-user {
  font-size: 11px;
  color: #fff;
}

.feed-material {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  margin-left: auto;
}

/* Action Button */
.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  background: linear-gradient(135deg, #10b981, #059669);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-button:hover {
  background: linear-gradient(135deg, #34d399, #10b981);
  transform: translateY(-1px);
}
</style>