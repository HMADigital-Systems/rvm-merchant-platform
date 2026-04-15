<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useMachineStore } from '../stores/machines';
import { storeToRefs } from 'pinia';
import { supabase } from '../services/supabase';
import { 
  Activity, Scale, Server, Users, Coins, 
  TrendingUp, TrendingDown, MapPin, Recycle, Clock,
  Flame, ChevronLeft, Wifi, WifiOff, Truck, Zap
} from 'lucide-vue-next';
import DeliveryRanking from '../components/DeliveryRanking.vue';
import ComparisonSummary from '../components/ComparisonSummary.vue';

const router = useRouter();
const machineStore = useMachineStore();
const { machines } = storeToRefs(machineStore);
const goBack = () => router.push('/');

// Selected equipment for highlighting
const selectedEquipmentId = ref<string | null>(null);

// Time range toggle
type TimeRange = 'day' | 'week' | 'month';
const activeTimeRange = ref<TimeRange>('day');

// Live clock
const currentTime = ref(new Date());
let timeInterval: ReturnType<typeof setInterval> | null = null;

// Formatting utilities
const formatWeight = (val: any): string => {
  const num = Number(val);
  return isNaN(num) ? '0.00' : num.toFixed(2);
};

const formatCurrency = (val: any): string => {
  const num = Number(val);
  return isNaN(num) ? '0.00' : num.toFixed(2);
};

const formatInteger = (val: any): string => {
  const num = Number(val);
  return isNaN(num) ? '0' : num.toString();
};

// Process machines for map display
const mapMachines = computed(() => {
  const machineData = machines.value;
  
  // If no real machines, use demo data
  if (!machineData || machineData.length === 0) {
    return [
      { id: 1, deviceNo: 'RVM-001', name: 'RVM-001 KL', lat: 3.1390, lng: 101.6869, isOnline: true, fillLevel: 45 },
      { id: 2, deviceNo: 'RVM-002', name: 'RVM-002 PJ', lat: 3.1279, lng: 101.6785, isOnline: true, fillLevel: 72 },
      { id: 3, deviceNo: 'RVM-003', name: 'RVM-003 Sunway', lat: 3.0732, lng: 101.6005, isOnline: true, fillLevel: 88 },
      { id: 4, deviceNo: 'RVM-004', name: 'RVM-004 USJ', lat: 3.0505, lng: 101.5850, isOnline: false, fillLevel: 30 },
      { id: 5, deviceNo: 'RVM-005', name: 'RVM-005 Klang', lat: 3.0833, lng: 101.4000, isOnline: true, fillLevel: 55 },
      { id: 6, deviceNo: 'RVM-006', name: 'RVM-006 Shah Alam', lat: 3.0735, lng: 101.5185, isOnline: true, fillLevel: 25 },
      { id: 7, deviceNo: 'RVM-007', name: 'RVM-007 Putrajaya', lat: 2.9264, lng: 101.6964, isOnline: false, fillLevel: 60 },
      { id: 8, deviceNo: 'RVM-008', name: 'RVM-008 Cyberjaya', lat: 2.9165, lng: 101.6394, isOnline: true, fillLevel: 92 },
      { id: 9, deviceNo: 'RVM-009', name: 'RVM-009 Kajang', lat: 2.9851, lng: 101.7939, isOnline: true, fillLevel: 38 },
      { id: 10, deviceNo: 'RVM-010', name: 'RVM-010 Serdang', lat: 2.9292, lng: 101.7119, isOnline: false, fillLevel: 15 }
    ] as any[];
  }
  
  return machineData.map((m: any) => ({
    id: m.id,
    deviceNo: m.deviceNo || m.device_no,
    name: m.name || m.deviceNo,
    lat: m.latitude || m.lat || 0,
    lng: m.longitude || m.lng || 0,
    isOnline: m.isOnline !== false,
    fillLevel: m.compartments?.[0]?.percent || m.compartments?.[0]?.fill_percent || 0,
    temperature: m.temperature
  }));
});

// Animated weight counter
const cumulativeKg = ref(0);
const displayKg = ref(0);
const displayExpenses = ref(0);
const isRollingUp = ref(false);

// Rolling number animation for weight and expenses (500ms)
watch(cumulativeKg, (newVal) => {
  const targetKg = newVal;
  const targetExpenses = newVal * 0.5;
  
  if (targetKg !== displayKg.value) {
    isRollingUp.value = true;
    const startKg = displayKg.value;
    const startExpenses = displayExpenses.value;
    const duration = 500;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const currentKg = startKg + (targetKg - startKg) * eased;
      displayKg.value = Number(currentKg.toFixed(2));
      displayExpenses.value = Number((startExpenses + (targetExpenses - startExpenses) * eased).toFixed(2));
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        isRollingUp.value = false;
        displayKg.value = Number(targetKg.toFixed(2));
        displayExpenses.value = Number(targetExpenses.toFixed(2));
      }
    };
    requestAnimationFrame(animate);
  }
});

// Map marker colors based on status
const getMarkerColor = (m: any) => {
  if (!m.isOnline) return '#6b7280'; // gray - offline
  if (m.fillLevel > 85) return '#ef4444'; // red - full
  if (m.fillLevel > 60) return '#f59e0b'; // yellow - filling
  return '#10b981'; // green - good
};

// Live submissions
interface LiveOrder {
  id: string;
  user: string;
  device: string;
  type: string;
  weight: number;
  isNew?: boolean;
}

const liveOrders = ref<LiveOrder[]>([]);
const collections = ref<{ id: string; equipmentId: string; collectedWeight: number; collectionTime: string }[]>([]);
let lastOrderId = '';
let pollInterval: ReturnType<typeof setInterval> | null = null;

// Format collection time
const formatCollectionTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
};

// Fetch collections for removal table
const fetchCollectionsData = async () => {
  try {
    const response = await fetch('/api/collections/history?limit=10');
    const result = await response.json();
    if (result.success && result.collections) {
      collections.value = result.collections.map((c: any) => ({
        id: c.id,
        equipmentId: c.equipmentId,
        collectedWeight: c.collectedWeight,
        collectionTime: c.collectionTime
      }));
    }
  } catch (e) {
    console.log('Using demo collection data');
    const now = new Date();
    collections.value = [
      { id: '1', equipmentId: 'Equipment RVM-001', collectedWeight: 85.50, collectionTime: new Date(now.getTime() - 1000 * 60 * 30).toISOString() },
      { id: '2', equipmentId: 'Equipment RVM-003', collectedWeight: 62.30, collectionTime: new Date(now.getTime() - 1000 * 60 * 120).toISOString() },
      { id: '3', equipmentId: 'Equipment RVM-007', collectedWeight: 45.80, collectionTime: new Date(now.getTime() - 1000 * 60 * 180).toISOString() },
      { id: '4', equipmentId: 'Equipment RVM-002', collectedWeight: 38.20, collectionTime: new Date(now.getTime() - 1000 * 60 * 240).toISOString() },
      { id: '5', equipmentId: 'Equipment RVM-005', collectedWeight: 28.90, collectionTime: new Date(now.getTime() - 1000 * 60 * 300).toISOString() }
    ];
  }
};

const formattedTime = computed(() => {
  return currentTime.value.toLocaleTimeString('en-MY', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
});

const formattedDate = computed(() => {
  return currentTime.value.toLocaleDateString('en-MY', { 
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
});

// Stats computed
const todayStats = computed(() => {
  const online = mapMachines.value.filter(m => m.isOnline).length;
  const offline = mapMachines.value.length - online;
  const avgFill = mapMachines.value.length > 0 
    ? Math.round(mapMachines.value.reduce((sum, m) => sum + m.fillLevel, 0) / mapMachines.value.length)
    : 0;
  return { online, offline, avgFill, total: mapMachines.value.length };
});

// Play ping sound
const playPingSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
};

// Fetch machines from store
const fetchMachines = async () => {
  await machineStore.fetchMachines();
};

// Fetch submissions from API
const fetchSubmissions = async () => {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    
    const { data } = await supabase
      .from('submission_reviews')
      .select('id, device_no, waste_type, api_weight, users(nickname)')
      .gte('submitted_at', dayStart.toISOString())
      .in('status', ['VERIFIED', 'APPROVED'])
      .order('submitted_at', { ascending: false })
      .limit(10);
    
    if (data) {
      liveOrders.value = data.map((s: any) => ({
        id: s.id,
        user: s.users?.nickname || 'Guest',
        device: s.device_no,
        type: s.waste_type,
        weight: s.api_weight,
        isNew: false
      }));
      lastOrderId = data[0]?.id || '';
    }
    
    cumulativeKg.value = data?.reduce((sum, s) => sum + (Number(s.api_weight) || 0), 0) || 0;
    displayKg.value = Number(cumulativeKg.value.toFixed(2));
    displayExpenses.value = Number((cumulativeKg.value * 0.5).toFixed(2));
  } catch (e) {
    console.log('Using fallback data');
    cumulativeKg.value = 1250;
    displayKg.value = 1250.00;
    displayExpenses.value = 625.00;
    liveOrders.value = [
      { id: '1', user: 'Ahmad R.', device: 'RVM-001', type: 'PET Plastic', weight: 12.5 },
      { id: '2', user: 'Sarah L.', device: 'RVM-003', type: 'Aluminum', weight: 8.2 },
    ];
  }
};

// Start polling
const generateDemoSubmission = async () => {
  const devices = mapMachines.value.map(m => m.deviceNo);
  const deviceNo = devices.length > 0 ? devices[Math.floor(Math.random() * devices.length)] : 'RVM-001';
  const wasteTypes = ['PET Plastic', 'Aluminum', 'Glass', 'Paper', 'Tin'];
  const randomUsers = ['Ahmad R.', 'Sarah L.', 'Mike T.', 'Jenny K.', 'David W.', 'Lisa M.'];
  const randomWeights = [5.2, 8.5, 12.3, 6.8, 15.1, 9.4, 7.2, 11.5];
  const user = randomUsers[Math.floor(Math.random() * randomUsers.length)] || 'Guest';
  const weight = randomWeights[Math.floor(Math.random() * randomWeights.length)] || 10;
  const wasteType = wasteTypes[Math.floor(Math.random() * wasteTypes.length)] || 'Mixed';
  
  // Try to insert into database first
  let dbSuccess = false;
  try {
    const { data, error } = await supabase
      .from('submission_reviews')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000001',
        device_no: deviceNo || 'RVM-001',
        waste_type: wasteType,
        api_weight: weight,
        calculated_value: Math.round(weight * 10),
        status: 'VERIFIED',
        submitted_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (!error && data) {
      dbSuccess = true;
      lastOrderId = data.id || '';
    }
  } catch (e) {
    console.log('DB insert failed, using fallback');
  }
  
  // Always add to live feed for demo purposes
  const demoId = 'demo-' + Date.now();
  liveOrders.value.unshift({
    id: demoId,
    user: user,
    device: deviceNo || 'RVM-001',
    type: wasteType,
    weight: weight,
    isNew: true
  });
  
  if (liveOrders.value.length > 10) liveOrders.value.pop();
  cumulativeKg.value = (cumulativeKg.value || 0) + weight;
  playPingSound();
  
  setTimeout(() => {
    const idx = liveOrders.value.findIndex(o => o.id === demoId);
    if (idx !== -1 && liveOrders.value[idx]) liveOrders.value[idx].isNew = false;
  }, 2000);
};

const startPolling = () => {
  if (pollInterval) return;
  
  pollInterval = setInterval(async () => {
    try {
      // Refresh machines
      await machineStore.fetchMachines();
      
      // Check for new submissions
      const { data } = await supabase
        .from('submission_reviews')
        .select('id, device_no, waste_type, api_weight, users(nickname)')
        .order('submitted_at', { ascending: false })
        .limit(1);
      
      if (data?.[0] && data[0].id !== lastOrderId && lastOrderId) {
        const newOrder = data[0];
        
        liveOrders.value.unshift({
          id: newOrder.id || 'unknown',
          user: newOrder.users?.[0]?.nickname || 'Guest',
          device: newOrder.device_no || 'RVM-000',
          type: newOrder.waste_type || 'Unknown',
          weight: Number(newOrder.api_weight) || 0,
          isNew: true
        });
        
        if (liveOrders.value.length > 10) liveOrders.value.pop();
        
        cumulativeKg.value = (cumulativeKg.value || 0) + (Number(newOrder.api_weight) || 0);
        playPingSound();
        
        setTimeout(() => {
          const idx = liveOrders.value.findIndex(o => o.id === newOrder.id);
          if (idx !== -1 && liveOrders.value[idx]) liveOrders.value[idx].isNew = false;
        }, 2000);
        
        lastOrderId = newOrder.id;
      }
    } catch (e) {}
  }, 5000);
};

onMounted(async () => {
  await fetchMachines();
  await fetchSubmissions();
  await fetchCollectionsData();
  startPolling();
  
  timeInterval = setInterval(() => {
    currentTime.value = new Date();
  }, 1000);
});

onUnmounted(() => {
  if (timeInterval) clearInterval(timeInterval);
  if (pollInterval) clearInterval(pollInterval);
});
</script>

<template>
  <div class="command-center-page">
    <!-- Header -->
    <header class="cc-header">
      <button @click="goBack" class="back-btn">
        <ChevronLeft :size="18" />
        Back
      </button>
      
      <div class="header-title">
        <div class="title-icon">
          <Activity :size="22" />
        </div>
        <h1>MALAYSIA RVM OPERATIONAL DATA</h1>
      </div>
      
      <div class="header-right">
        <div class="demo-controls">
          <button @click="generateDemoSubmission" class="demo-btn" title="Generate Demo Submission">
            <Zap :size="14" />
            Demo
          </button>
        </div>
        <div class="clock-box">
          <Clock :size="18" />
          <span class="time">{{ formattedTime }}</span>
        </div>
        <div class="date">{{ formattedDate }}</div>
      </div>
    </header>

    <!-- Main Grid -->
    <div class="cc-grid">
      <!-- LEFT COLUMN -->
      <aside class="cc-left">
        <!-- Top: Cumulative Totals -->
        <div class="cyber-card">
          <div class="section-title">
            <Server :size="16" />
            <span>CUMULATIVE TOTALS</span>
          </div>
          <div class="stats-card">
            <div class="stat-row">
              <span class="label">Today</span>
              <span class="value">{{ formatWeight(displayKg) }}kg</span>
            </div>
            <div class="stat-row">
              <span class="label">This Week</span>
              <span class="value">{{ formatWeight(displayKg * 7) }}kg</span>
            </div>
            <div class="divider"></div>
            <div class="stat-row">
              <span class="label">Total Volume</span>
              <span class="value emerald">{{ formatWeight(displayKg) }}kg</span>
            </div>
            <div class="stat-row">
              <span class="label">Points Paid</span>
              <span class="value amber">{{ formatCurrency(displayExpenses) }}</span>
            </div>
          </div>
        </div>

        <!-- Middle: Performance Summary -->
        <div class="cyber-card">
          <div class="section-title">
            <Flame :size="16" />
            <span>PERFORMANCE SUMMARY</span>
          </div>
          <div class="toggle-card">
            <div class="toggle-btns">
              <button 
                v-for="range in ['day', 'week', 'month']" 
                :key="range"
                @click="activeTimeRange = range as TimeRange"
                :class="['toggle-btn', { active: activeTimeRange === range }]"
              >
                {{ range.toUpperCase() }}
              </button>
            </div>
            <div class="toggle-result" :class="{ rolling: isRollingUp }">
              <div class="result-value">
                {{ activeTimeRange === 'day' ? formatWeight(displayKg) : activeTimeRange === 'week' ? formatWeight(displayKg * 7) : formatWeight(displayKg * 30) }}
              </div>
              <div class="result-label">kg collected</div>
            </div>
          </div>
        </div>

        <!-- Bottom: Delivery Rankings -->
        <div class="cyber-card">
          <div class="section-title">
            <TrendingDown :size="16" />
            <span>DELIVERY RANKINGS</span>
          </div>
          <DeliveryRanking />
        </div>
      </aside>

      <!-- CENTER: Map -->
      <main class="cc-map">
        <div class="map-container">
          <div class="map-markers">
            <div 
              v-for="m in mapMachines" 
              :key="m.id" 
              :class="['marker', { selected: selectedEquipmentId === `Equipment ${m.deviceNo}` || selectedEquipmentId === m.deviceNo }]"
              :style="{ 
                background: selectedEquipmentId && (selectedEquipmentId === `Equipment ${m.deviceNo}` || selectedEquipmentId === m.deviceNo) ? '#06b6d4' : getMarkerColor(m),
                left: ((m.lng - 101.5) * 300 + 45) + '%',
                top: ((m.lat - 3.8) * 300 + 40) + '%'
              }"
              :title="`${m.name} - ${m.isOnline ? 'Online' : 'Offline'} - Fill: ${m.fillLevel}%`"
            >
              <div class="marker-pulse" :style="{ background: selectedEquipmentId && (selectedEquipmentId === `Equipment ${m.deviceNo}` || selectedEquipmentId === m.deviceNo) ? '#06b6d4' : getMarkerColor(m) }"></div>
              <span class="marker-label">{{ m.deviceNo }}</span>
              <span v-if="selectedEquipmentId && (selectedEquipmentId === `Equipment ${m.deviceNo}` || selectedEquipmentId === m.deviceNo)" class="marker-badge">Recently Emptied</span>
            </div>
          </div>
          
          <MapPin :size="48" class="map-icon" />
          <p>LIVE EQUIPMENT MAP</p>
          <div class="map-stats">
            <span class="stat-online"><Wifi :size="12" /> {{ todayStats.online }} Online</span>
            <span class="stat-offline"><WifiOff :size="12" /> {{ todayStats.offline }} Offline</span>
          </div>
        </div>
      </main>

      <!-- RIGHT COLUMN -->
      <aside class="cc-right">
        <!-- Top: Withdrawal Trends -->
        <div class="cyber-card">
          <div class="section-title">
            <TrendingUp :size="16" />
            <span>WITHDRAWAL TRENDS</span>
          </div>
          <ComparisonSummary />
        </div>

        <!-- Middle: Submitting Orders -->
        <div class="cyber-card">
          <div class="section-title">
            <Recycle :size="16" />
            <span>SUBMITTING ORDERS</span>
            <span class="live-dot"></span>
          </div>
          <div class="feed-list">
            <div 
              v-for="order in liveOrders" 
              :key="order.id" 
              :class="['feed-item', { new: order.isNew }]"
            >
              <div class="feed-icon">
                <Recycle :size="14" />
              </div>
              <div class="feed-info">
                <div class="feed-user">{{ order.user }}</div>
                <div class="feed-meta">
                  <span>{{ order.device }}</span>
                  <span class="dot">•</span>
                  <span>{{ order.type }}</span>
                </div>
              </div>
              <div class="feed-weight">+{{ formatWeight(order.weight) }}kg</div>
            </div>
            <div v-if="liveOrders.length === 0" class="empty-feed">
              Waiting for submissions...
            </div>
          </div>
        </div>

        <!-- Bottom: Equipment Removal Data -->
        <div class="cyber-card">
          <div class="section-title">
            <Truck :size="16" />
            <span>EQUIPMENT REMOVAL DATA</span>
          </div>
          <div class="removal-table">
            <div class="table-header">
              <span class="col-equip">EQUIPMENT ID</span>
              <span class="col-weight">WEIGHT</span>
              <span class="col-time">TIME</span>
            </div>
            <div class="table-body">
              <div 
                v-for="item in collections.slice(0, 5)" 
                :key="item.id"
                :class="['table-row', { selected: selectedEquipmentId === item.equipmentId }]"
                @click="selectedEquipmentId = item.equipmentId"
              >
                <span class="col-equip">{{ item.equipmentId }}</span>
                <span class="col-weight">{{ formatWeight(item.collectedWeight) }}kg</span>
                <span class="col-time">{{ formatCollectionTime(item.collectionTime) }}</span>
              </div>
              <div v-if="collections.length === 0" class="empty-state">No removal data</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style>
.command-center-page {
  min-height: 100vh;
  background: #000b1a;
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  display: flex;
  flex-direction: column;
}

/* Header */
.cc-header {
  height: 72px;
  background: linear-gradient(180deg, #001030 0%, #000b1a 100%);
  border-bottom: 1px solid #10b981;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: 0 4px 20px rgba(16, 185, 129, 0.2);
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid #10b981;
  border-radius: 8px;
  color: #10b981;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.back-btn:hover { background: rgba(16, 185, 129, 0.25); }

.header-title {
  display: flex;
  align-items: center;
  gap: 14px;
}

.title-icon {
  width: 42px; height: 42px;
  background: linear-gradient(135deg, #10b981, #059669);
  border-radius: 8px;
  display: flex;
  align-items: center; justify-content: center;
  color: #fff;
}

.header-title h1 {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #10b981;
  text-shadow: 0 0 15px rgba(16, 185, 129, 0.5);
}

.header-right { display: flex; align-items: center; gap: 16px; }

.demo-controls { display: flex; gap: 8px; }

.demo-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  background: rgba(6, 182, 212, 0.15);
  border: 1px solid #06b6d4;
  border-radius: 6px;
  color: #06b6d4;
  font-size: 12px; font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.demo-btn:hover {
  background: rgba(6, 182, 212, 0.3);
  box-shadow: 0 0 15px rgba(6, 182, 212, 0.4);
}

.clock-box {
  display: flex; align-items: center; gap: 8px;
  color: #10b981;
  font-size: 20px; font-weight: 700; font-family: monospace;
}

.date { color: #64748b; font-size: 12px; }

/* Grid */
.cc-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 340px 1fr 360px;
  grid-template-rows: 1fr;
  gap: 16px;
  background: transparent;
  padding: 16px;
  min-height: calc(100vh - 72px);
}

.cc-left, .cc-map, .cc-right {
  background: transparent;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 500px;
}

/* Cyber Card */
.cyber-card {
  background: rgba(6, 30, 75, 0.85);
  border: 1px solid rgba(6, 182, 212, 0.4);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 
    0 0 15px rgba(6, 182, 212, 0.15),
    inset 0 0 30px rgba(6, 182, 212, 0.03);
  transition: all 0.3s ease;
}

.cyber-card:hover {
  border-color: rgba(6, 182, 212, 0.7);
  box-shadow: 
    0 0 25px rgba(6, 182, 212, 0.25),
    inset 0 0 40px rgba(6, 182, 212, 0.05);
}

/* Section Title */
.section-title {
  display: flex; align-items: center; gap: 8px;
  color: #06b6d4;
  font-size: 11px; font-weight: 700;
  letter-spacing: 1px;
  margin-bottom: 12px;
}

.live-dot {
  width: 8px; height: 8px;
  background: #10b981;
  border-radius: 50%;
  margin-left: auto;
  animation: pulse 1s infinite;
}
@keyframes pulse { 0%,100%{opacity:1;box-shadow:0 0 8px #10b981} 50%{opacity:0.5;box-shadow:0 0 0} }

/* Stats Card */
.stats-card {
  background: rgba(16,185,129,0.1);
  border-left: 2px solid #10b981;
  border-radius: 10px;
}

.stat-row {
  display: flex; justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #1e3a5f;
}
.stat-row:last-child { border-bottom: none; }
.stat-row .label { color: #64748b; font-size: 12px; }
.stat-row .value { font-size: 16px; font-weight: 700; }
.stat-row .value.emerald { color: #10b981; }
.stat-row .value.amber { color: #f59e0b; }
.divider { height: 1px; background: #1e3a5f; }

/* Toggle Card */
.toggle-card {
  background: rgba(16,185,129,0.1);
  border-radius: 10px;
  padding: 16px;
}

.toggle-btns { display: flex; gap: 6px; margin-bottom: 16px; }

.toggle-btn {
  flex: 1; padding: 10px;
  background: #0f172a;
  border: 1px solid #1e3a5f;
  border-radius: 6px;
  color: #64748b;
  font-size: 12px; font-weight: 700;
  cursor: pointer; transition: all 0.2s;
}
.toggle-btn.active { background: #10b981; color: #000; border-color: #10b981; }

.toggle-result { text-align: center; padding: 10px 0; transition: all 0.3s; }
.toggle-result.rolling .result-value { color: #34d399; text-shadow: 0 0 20px #10b981; }

.result-value {
  font-size: 32px; font-weight: 700;
  color: #10b981;
  transition: all 0.3s;
}
.result-label { font-size: 11px; color: #64748b; margin-top: 4px; }

/* Map */
.cc-map {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #0a1628 0%, #000b1a 100%);
  border: 1px solid rgba(6, 182, 212, 0.3);
  border-radius: 12px;
  min-height: 500px;
}

.map-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 480px;
}

.map-markers {
  position: absolute;
  inset: 20px;
}

.marker {
  position: absolute;
  width: 24px; height: 24px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  display: flex; align-items: center; justify-content: center;
}

.marker-pulse {
  position: absolute;
  width: 100%; height: 100%;
  border-radius: 50%;
  animation: marker-pulse 2s infinite;
}
@keyframes marker-pulse {
  0%,100%{transform:scale(1);opacity:0.9} 50%{transform:scale(1.5);opacity:0}
}

.marker-label {
  position: absolute;
  top: -20px;
  font-size: 8px;
  white-space: nowrap;
  color: #64748b;
}

.map-icon {
  position: absolute;
  color: #1e3a5f;
  opacity: 0.3;
}

.map-container p {
  position: absolute;
  top: 30px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 14px;
  color: #64748b;
}

.map-stats {
  position: absolute;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  display: flex; gap: 16px;
  font-size: 11px;
}

.stat-online { display: flex; align-items: center; gap: 4px; color: #10b981; }
.stat-offline { display: flex; align-items: center; gap: 4px; color: #6b7280; }

/* Removal Table */
.removal-table {
  background: rgba(6, 30, 75, 0.85);
  border: 1px solid rgba(6, 182, 212, 0.3);
  border-radius: 10px;
  overflow: hidden;
}

.removal-table .table-header {
  display: grid;
  grid-template-columns: 1fr 100px 120px;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(6, 182, 212, 0.15);
  border-bottom: 1px solid rgba(6, 182, 212, 0.3);
  color: #06b6d4;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.removal-table .table-body {
  max-height: 180px;
  overflow-y: auto;
}

.removal-table .table-row {
  display: grid;
  grid-template-columns: 1fr 100px 120px;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(6, 182, 212, 0.1);
  color: #94a3b8;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.removal-table .table-row:hover {
  background: rgba(6, 182, 212, 0.1);
}

.removal-table .table-row.selected {
  background: rgba(6, 182, 212, 0.2);
  border-left: 3px solid #06b6d4;
}

.removal-table .col-equip { font-weight: 600; color: #cbd5e1; }
.removal-table .col-weight { color: #10b981; font-weight: 600; }
.removal-table .col-time { color: #64748b; }
.removal-table .empty-state { text-align: center; padding: 20px; color: #475569; font-size: 11px; }

/* Selected marker */
.marker.selected {
  z-index: 100;
}

.marker-badge {
  position: absolute;
  top: -24px;
  left: 50%;
  transform: translateX(-50%);
  background: #06b6d4;
  color: #000;
  font-size: 8px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  animation: badge-pulse 1s infinite;
}

@keyframes badge-pulse {
  0%,100%{opacity:1;box-shadow:0 0 6px #06b6d4}
  50%{opacity:0.8;box-shadow:0 0 12px #06b6d4}
}

/* Feed */
.feed-list { max-height: 300px; overflow-y: auto; }

.feed-item {
  display: flex; align-items: center; gap: 10px;
  padding: 12px;
  background: rgba(16,185,129,0.06);
  border-left: 2px solid #1e3a5f;
  border-radius: 6px;
  margin-bottom: 8px;
  transition: all 0.3s;
}

.feed-item.new {
  background: rgba(16,185,129,0.2);
  border-left-color: #10b981;
  animation: slide-in 2s ease-out forwards;
}
@keyframes slide-in {
  0%{opacity:0;transform:translateX(-20px)} 20%{transform:translateX(10px)}
  40%{transform:translateX(-5px)} 100%{opacity:1;transform:translateX(0)}
}

.feed-icon {
  width: 28px; height: 28px;
  background: rgba(16,185,129,0.15);
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  color: #10b981;
}

.feed-info { flex: 1; }
.feed-user { font-size: 13px; font-weight: 600; }
.feed-meta { font-size: 10px; color: #64748b; display: flex; gap: 4px; }
.feed-weight { font-size: 14px; font-weight: 700; color: #34d399; }

.empty-feed { text-align: center; color: #475569; padding: 40px; font-size: 12px; }

/* Chart */
.chart-box {
  background: rgba(16,185,129,0.1);
  border-radius: 10px;
  padding: 16px;
  height: 120px;
  display: flex; flex-direction: column;
}

.chart-bars { flex: 1; display: flex; align-items: flex-end; gap: 6px; }
.chart-bar { flex: 1; background: linear-gradient(to top,#10b981,#34d399); border-radius: 3px 3px 0 0; }
.chart-labels { display: flex; justify-content: space-between; margin-top: 8px; font-size: 9px; color: #475569; }

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: #000; }
::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 2px; }
</style>