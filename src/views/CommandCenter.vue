<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue';
import { supabase } from '../services/supabase';
import { Activity, Leaf, MapPin, Download, FileText, Zap, Users } from 'lucide-vue-next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ========================================
// CLOCK
// ========================================
const currentTime = ref('00:00:00');
const mapRef = ref<HTMLDivElement | null>(null);
let mapInstance: L.Map | null = null;

const machineLocations = [
  { device: '071582000006', name: 'Idaman Bukit Jelutong', type: 'UCO', lat: 3.11114, lng: 101.53886, status: 'active' },
  { device: '071582000005', name: 'Sunway College', type: 'UCO', lat: 3.06771, lng: 101.60386, status: 'full' },
  { device: '071582000010', name: 'Sunway College', type: 'UCO', lat: 3.06771, lng: 101.60386, status: 'active' },
  { device: '071582000001', name: 'Meranti Apt (Kertas)', type: 'Paper', lat: 3.04646, lng: 101.60182, status: 'active' },
  { device: '071582000007', name: 'Meranti Apt (UCO)', type: 'UCO', lat: 3.04646, lng: 101.60182, status: 'active' },
  { device: '071582000003', name: 'Idaman DJ (UCO)', type: 'UCO', lat: 3.11114, lng: 101.53886, status: 'offline' },
  { device: '071582000002', name: 'Idaman DJ', type: 'General', lat: 3.10904, lng: 101.57944, status: 'active' },
  { device: '071582000008', name: 'Persiaran Majlis', type: 'Mixed', lat: 2.813, lng: 101.495, status: 'active' },
  { device: '071582000004', name: 'Persiaran Majlis (2)', type: 'Mixed', lat: 2.813, lng: 101.495, status: 'active' },
  { device: '071582000009', name: 'Taman Wawasan', type: 'UCO', lat: 3.03437, lng: 101.62348, status: 'active' },
];

const initMap = () => {
  if (mapInstance) return;
  nextTick(() => {
    const el = document.getElementById('rvm-map');
    if (!el) return;
    
    mapInstance = L.map(el, {
      center: [3.09, 101.58],
      zoom: 12,
      zoomControl: false,
    });
    
    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(mapInstance);
    
    // Zoom controls
    L.control.zoom({ position: 'topleft' }).addTo(mapInstance);
    
    // Custom icon colors
    const icons: Record<string, L.DivIcon> = {};
    ['active', 'full', 'offline'].forEach(status => {
      const color = status === 'active' ? '#34d399' : status === 'full' ? '#f87171' : '#64748b';
      icons[status] = L.divIcon({
        className: '',
        html: `<div style="width: 14px; height: 14px; background: ${color}; border: 2px solid #1e293b; border-radius: 50%; box-shadow: 0 0 8px ${color}80;"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
    });
    
    // Add markers
    machineLocations.forEach(m => {
      const marker = L.marker([m.lat, m.lng], { icon: icons[m.status] }).addTo(mapInstance!);
      marker.bindPopup(`<div style="font-size:12px;background:#0f172a;color:#e2e8f0;padding:8px;border-radius:8px;border:1px solid #1e293b;min-width:160px">
        <strong style="color:${m.status === 'active' ? '#34d399' : m.status === 'full' ? '#f87171' : '#64748b'}">●</strong> <strong>${m.name}</strong><br/>
        <span style="color:#94a3b8">${m.device} &middot; ${m.type}</span>
      </div>`);
    });
  });
};

const updateClock = () => {
  const now = new Date();
  currentTime.value = now.toLocaleTimeString('en-GB', { hour12: false });
};
onMounted(() => {
  updateClock();
  setInterval(updateClock, 1000);
  initMap();
});

// ========================================
// LIVE DATA
// ========================================
const totalWeight = ref(0);
const totalPoints = ref(0);
const todayWeight = ref(0);
const weekWeight = ref(0);
const monthWeight = ref(0);
const liveActivityFeed = ref<any[]>([]);
const liveUserRankings = ref<any[]>([]);
const isLoading = ref(true);

const activePeriod = ref('Week');
const periods = ['Day', 'Week', 'Month'];

const periodWeight = computed(() => {
  switch (activePeriod.value) {
    case 'Day': return todayWeight.value;
    case 'Week': return weekWeight.value;
    case 'Month': return monthWeight.value;
    default: return weekWeight.value;
  }
});

async function fetchLiveData() {
  isLoading.value = true;
  try {
    const today = new Date();
    const todayStart = today.toISOString().split('T')[0] + 'T00:00:00Z';
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0] + 'T00:00:00Z';
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0] + 'T00:00:00Z';

    // Totals from users table RPCs
    const [wtRes, ptRes] = await Promise.all([
      supabase.rpc('get_total_weight', { merchant_uuid: null }),
      supabase.rpc('get_total_points', { merchant_uuid: null }),
    ]);
    if (!wtRes.error) totalWeight.value = Number(wtRes.data || 0);
    if (!ptRes.error) totalPoints.value = Number(ptRes.data || 0);

    // Period totals from submission_reviews
    const { data: todayData } = await supabase
      .from('submission_reviews')
      .select('api_weight')
      .gte('submitted_at', todayStart);
    todayWeight.value = (todayData || []).reduce((s: number, r: any) => s + Number(r.api_weight || 0), 0);

    const { data: weekData } = await supabase
      .from('submission_reviews')
      .select('api_weight')
      .gte('submitted_at', weekAgo);
    weekWeight.value = (weekData || []).reduce((s: number, r: any) => s + Number(r.api_weight || 0), 0);

    const { data: monthData } = await supabase
      .from('submission_reviews')
      .select('api_weight')
      .gte('submitted_at', monthAgo);
    monthWeight.value = (monthData || []).reduce((s: number, r: any) => s + Number(r.api_weight || 0), 0);

    // Activity feed from vendor API via proxy
    try {
      const feedRes = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: '/api/open/v1/put', method: 'GET', params: { pageNum: 1, pageSize: 10 } })
      });
      const feedData = await feedRes.json();
      if (feedData.code === 200 && feedData.data?.list) {
        liveActivityFeed.value = feedData.data.list.map((r: any) => ({
          location: r.deviceName || r.deviceNo || 'Unknown',
          user: r.username || 'User',
          time: formatTimeAgo(r.createTime),
          weight: '+' + Number(r.weight || 0).toFixed(1) + ' kg',
          type: r.rubbishLogDetailsVOList?.[0]?.rubbishName || 'Recycling'
        }));
      }
    } catch {}

    // Top recyclers from users table
    const { data: topUsers } = await supabase
      .from('users')
      .select('nickname, total_weight')
      .not('total_weight', 'is', null)
      .order('total_weight', { ascending: false })
      .limit(10);

    if (topUsers) {
      liveUserRankings.value = topUsers
        .filter((u: any) => u.nickname)
        .slice(0, 5)
        .map((u: any, i: number) => ({
          rank: i + 1,
          name: u.nickname,
          weight: Number(u.total_weight || 0).toFixed(0) + ' kg'
        }));
    }
  } catch (err) {
    console.error('Live data fetch error:', err);
  } finally {
    isLoading.value = false;
  }
}

function formatTimeAgo(dateStr: string) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

// Kick off data fetch after component mounts
const startDataFetch = () => {
  setTimeout(fetchLiveData, 500);
  setInterval(fetchLiveData, 30000);
};
startDataFetch();


</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-200 font-mono">

    <!-- ================================ -->
    <!-- TOP STATUS BAR                   -->
    <!-- ================================ -->
    <header class="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between text-white">
      <!-- Left: Title -->
      <div class="flex items-center gap-3">
        <Activity :size="20" class="text-emerald-400" />
        <span class="text-sm font-bold tracking-wide">Malaysia RVM Command Center</span>
        <span class="text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-700 px-2 py-0.5 rounded flex items-center gap-1">
          <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          LIVE
        </span>
      </div>

      <!-- Center: Clock -->
      <div class="text-lg font-bold tracking-widest text-emerald-300">
        {{ currentTime }}
      </div>

      <!-- Right: Health Badges -->
      <div class="flex items-center gap-2 text-xs">
        <span class="inline-flex items-center gap-1.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-md px-2 py-0.5">
          <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> 8 Online
        </span>
        <span class="inline-flex items-center gap-1.5 bg-amber-950 text-amber-400 border border-amber-800 rounded-md px-2 py-0.5">
          <span class="w-1.5 h-1.5 bg-amber-400 rounded-full" /> 3 Full
        </span>
        <span class="inline-flex items-center gap-1.5 bg-red-950 text-red-400 border border-red-800 rounded-md px-2 py-0.5">
          <span class="w-1.5 h-1.5 bg-red-400 rounded-full" /> 2 Offline
        </span>
        <span class="bg-emerald-600 px-3 py-1 text-xs font-semibold rounded cursor-pointer hover:bg-emerald-500 transition-colors">Live</span>
      </div>
    </header>

    <!-- ================================ -->
    <!-- 3-COLUMN GRID                     -->
    <!-- ================================ -->
    <div class="grid grid-cols-12 gap-4 p-4 min-h-[calc(100vh-65px)]">

      <!-- ============================== -->
      <!-- LEFT COLUMN: Analytics Sidebar -->
      <!-- ============================== -->
      <aside class="col-span-3 space-y-4">

        <!-- Block A: Cumulative Totals -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 class="text-xs uppercase tracking-wider text-slate-400 mb-3 font-semibold">Cumulative Totals</h3>
          <div v-if="isLoading" class="text-xs text-slate-500">Loading...</div>
          <div v-else class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-slate-400">Today</span><span class="font-semibold">{{ todayWeight.toFixed(1) }} kg</span></div>
            <div class="flex justify-between"><span class="text-slate-400">This Week</span><span class="font-semibold">{{ weekWeight.toFixed(1) }} kg</span></div>
            <div class="border-t border-slate-800 pt-2 flex justify-between"><span class="text-slate-400">Total Volume</span><span class="font-semibold text-emerald-400">{{ totalWeight >= 1000 ? (totalWeight/1000).toFixed(1)+'k' : totalWeight.toFixed(0) }} kg</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Points Paid</span><span class="font-semibold text-amber-400">{{ totalPoints >= 1000 ? (totalPoints/1000).toFixed(1)+'k' : totalPoints.toFixed(0) }}</span></div>
          </div>
        </div>

        <!-- Block B: Sustainability Metrics -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 class="text-xs uppercase tracking-wider text-slate-400 mb-3 font-semibold">Sustainability</h3>
          <div v-if="isLoading" class="text-xs text-slate-500">Loading...</div>
          <div v-else class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-slate-400">Recycled Weight</span><span>{{ totalWeight >= 1000 ? (totalWeight/1000).toFixed(1)+'k' : totalWeight.toFixed(0) }} kg</span></div>
            <div class="flex justify-between"><span class="text-slate-400">CO₂ Saved</span><span class="text-emerald-400 font-bold">{{ (totalWeight * 2.8).toFixed(1) }} kg</span></div>
            <div class="flex justify-between items-center"><span class="text-slate-400 flex items-center gap-1"><Leaf :size="12" /> Trees</span><span>{{ Math.floor(totalWeight / 25) }}</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Energy Saved</span><span>{{ (totalWeight * 5.33).toFixed(0) }} kWh</span></div>
          </div>
          <div class="flex gap-2 mt-4">
            <button class="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
              <Download :size="12" /> Export
            </button>
            <button class="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
              <FileText :size="12" /> PDF
            </button>
          </div>
        </div>

        <!-- Block C: Time Period Collection Toggle -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div class="flex bg-slate-800 rounded-lg p-0.5 mb-4">
            <button
              v-for="period in periods"
              :key="period"
              @click="activePeriod = period"
              class="flex-1 text-xs py-1.5 rounded-md font-semibold transition-colors text-center"
              :class="activePeriod === period ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'"
            >
              {{ period }}
            </button>
          </div>
          <div class="text-center">
            <p class="text-xs text-slate-400">This {{ activePeriod }}</p>
            <p class="text-2xl font-bold text-emerald-400">{{ periodWeight.toFixed(1) }} <span class="text-sm font-normal text-slate-400">kg</span></p>
            <p class="text-xs text-slate-500 mt-1">collected this {{ activePeriod.toLowerCase() }}</p>
          </div>
        </div>

      </aside>

      <!-- ============================== -->
      <!-- CENTER COLUMN: Live Geo Map     -->
      <!-- ============================== -->
      <main class="col-span-6">
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-full">
          <!-- Map Header -->
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs uppercase tracking-wider text-slate-400 font-semibold">RVM Machine Status</h3>
            <div class="flex items-center gap-3 text-[10px]">
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400" /> Active</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-400" /> Full</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-slate-500" /> Offline</span>
            </div>
          </div>

          <!-- Map Container with Leaflet -->
          <div id="rvm-map" class="bg-slate-950 rounded-lg min-h-[500px] border border-slate-800 relative overflow-hidden flex-1"></div>
        </div>
      </main>

      <!-- ============================== -->
      <!-- RIGHT COLUMN: Activity + Rankings -->
      <!-- ============================== -->
      <aside class="col-span-3 space-y-4">

        <!-- Block A: Live Activity Feed -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div class="flex items-center gap-2 mb-3">
            <Zap :size="14" class="text-emerald-400" />
            <h3 class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Live Activity</h3>
          </div>
          <div class="space-y-2 max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 pr-1">
            <div
              v-for="(event, i) in liveActivityFeed"
              :key="i"
              class="bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs flex items-center justify-between"
            >
              <div class="min-w-0 flex-1">
                <p class="text-slate-200 font-medium truncate">{{ event.location }}</p>
                <p class="text-slate-500 mt-0.5">{{ event.user }} · {{ event.time }}</p>
              </div>
              <span class="text-emerald-400 font-bold ml-2 shrink-0">{{ event.weight }}</span>
            </div>
          </div>
        </div>

        <!-- Block B: Real-Time User Rankings -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div class="flex items-center gap-2 mb-3">
            <Users :size="14" class="text-emerald-400" />
            <h3 class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Top Recyclers</h3>
          </div>
          <div class="space-y-1">
            <div
              v-for="user in liveUserRankings"
              :key="user.rank"
              class="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/50 transition-colors text-xs"
            >
              <div class="flex items-center gap-2">
                <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  :class="user.rank === 1 ? 'bg-amber-500/20 text-amber-400' : user.rank === 2 ? 'bg-slate-500/20 text-slate-300' : user.rank === 3 ? 'bg-orange-500/20 text-orange-400' : 'text-slate-500'"
                >
                  {{ user.rank }}
                </span>
                <span class="text-slate-300">{{ user.name }}</span>
              </div>
              <span class="text-emerald-400 font-semibold">{{ user.weight }}</span>
            </div>
          </div>
        </div>

      </aside>

    </div>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: #1e293b;
  border-radius: 4px;
}

/* Leaflet dark theme overrides */
:deep(.leaflet-container) {
  background: #0f172a;
}
:deep(.leaflet-popup-content-wrapper) {
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid #1e293b;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
:deep(.leaflet-popup-tip) {
  background: #0f172a;
  border: 1px solid #1e293b;
}
:deep(.leaflet-control-zoom a) {
  background: #1e293b;
  color: #94a3b8;
  border-color: #334155;
}
:deep(.leaflet-control-zoom a:hover) {
  background: #334155;
  color: #e2e8f0;
}
:deep(.leaflet-control-attribution) {
  display: none;
}
</style>
