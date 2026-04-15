<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Truck, RefreshCw, Package } from 'lucide-vue-next';

interface CollectionItem {
  id: string;
  equipmentId: string;
  materialType: string;
  collectedWeight: number;
  collectionTime: string;
  status: string;
  collectorName?: string;
  collectorPhone?: string;
}

const collections = ref<CollectionItem[]>([]);
const isLoading = ref(false);
const lastUpdated = ref<Date | null>(null);
const isNewItem = ref(false);

let pollInterval: ReturnType<typeof setInterval> | null = null;

const fetchCollections = async () => {
  isLoading.value = true;
  try {
    const response = await fetch('/api/collections/history?limit=15');
    const result = await response.json();
    
    if (result.success && result.collections) {
      const oldTop = collections.value[0]?.id;
      collections.value = result.collections;
      lastUpdated.value = new Date();
      
      if (oldTop && oldTop !== result.collections[0]?.id) {
        isNewItem.value = true;
        playPingSound();
        setTimeout(() => { isNewItem.value = false; }, 2000);
      }
    }
  } catch (error) {
    console.log('Using demo collection data');
    const now = new Date();
    collections.value = [
      { id: '1', equipmentId: 'Equipment RVM-001', materialType: 'Mixed Recyclables', collectedWeight: 85.50, collectionTime: new Date(now.getTime() - 1000 * 60 * 30).toISOString(), status: 'Emptied', collectorName: 'Ahmed', collectorPhone: '012****1234' },
      { id: '2', equipmentId: 'Equipment RVM-003', materialType: 'PET Plastic', collectedWeight: 62.30, collectionTime: new Date(now.getTime() - 1000 * 60 * 120).toISOString(), status: 'Emptied', collectorName: 'Sarah', collectorPhone: '017****5678' },
      { id: '3', equipmentId: 'Equipment RVM-007', materialType: 'Aluminum', collectedWeight: 45.80, collectionTime: new Date(now.getTime() - 1000 * 60 * 180).toISOString(), status: 'Emptied', collectorName: 'Mike', collectorPhone: '013****9012' },
      { id: '4', equipmentId: 'Equipment RVM-002', materialType: 'Glass', collectedWeight: 38.20, collectionTime: new Date(now.getTime() - 1000 * 60 * 240).toISOString(), status: 'Emptied', collectorName: 'Lisa', collectorPhone: '016****3456' },
      { id: '5', equipmentId: 'Equipment RVM-005', materialType: 'Paper', collectedWeight: 28.90, collectionTime: new Date(now.getTime() - 1000 * 60 * 300).toISOString(), status: 'Emptied', collectorName: 'John', collectorPhone: '019****7890' }
    ];
    lastUpdated.value = new Date();
  } finally {
    isLoading.value = false;
  }
};

const playPingSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {}
};

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
};

const formatWeight = (weight: any) => {
  const num = Number(weight);
  return isNaN(num) ? '0.00' : num.toFixed(2);
};

const startPolling = () => {
  if (pollInterval) return;
  fetchCollections();
  pollInterval = setInterval(fetchCollections, 8000);
};

const stopPolling = () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
};

const formatLastUpdate = (date: Date | null) => {
  if (!date) return '--:--';
  return date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

onMounted(() => {
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="collections-history" :class="{ newItem: isNewItem }">
    <div class="ch-header">
      <Truck :size="16" />
      <span>COLLECTIONS HISTORY</span>
      <div class="live-indicator">
        <RefreshCw :size="12" :class="{ spinning: isLoading }" />
        <span class="time">{{ formatLastUpdate(lastUpdated) }}</span>
      </div>
    </div>

    <div class="ch-table">
      <div class="table-header">
        <span class="col-equip">EQUIPMENT</span>
        <span class="col-material">MATERIAL</span>
        <span class="col-weight">WEIGHT</span>
        <span class="col-time">TIME</span>
      </div>
      
      <div class="table-body">
        <div 
          v-for="item in collections" 
          :key="item.id"
          class="table-row"
        >
          <span class="col-equip">
            <Truck :size="12" class="row-icon" />
            {{ item.equipmentId }}
          </span>
          <span class="col-material">
            <Package :size="12" class="row-icon" />
            {{ item.materialType }}
          </span>
          <span class="col-weight">
            {{ formatWeight(item.collectedWeight) }}kg
          </span>
          <span class="col-time">
            {{ formatDate(item.collectionTime) }} {{ formatTime(item.collectionTime) }}
          </span>
        </div>
        
        <div v-if="collections.length === 0 && !isLoading" class="empty-state">
          No collections recorded yet
        </div>
        
        <div v-if="isLoading && collections.length === 0" class="loading-state">
          Loading collections...
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collections-history {
  background: rgba(6, 30, 75, 0.85);
  border: 1px solid rgba(6, 182, 212, 0.3);
  border-radius: 12px;
  padding: 16px;
  transition: all 0.3s ease;
}

.collections-history.newItem {
  border-color: #10b981;
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
}

.ch-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #06b6d4;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  margin-bottom: 12px;
}

.live-indicator {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: 10px;
}

.live-indicator .spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.ch-table {
  background: rgba(3, 15, 40, 0.6);
  border-radius: 8px;
  overflow: hidden;
}

.table-header {
  display: grid;
  grid-template-columns: 1fr 1fr 70px 90px;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(6, 182, 212, 0.1);
  border-bottom: 1px solid rgba(6, 182, 212, 0.2);
  color: #06b6d4;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.table-body {
  max-height: 240px;
  overflow-y: auto;
}

.table-row {
  display: grid;
  grid-template-columns: 1fr 1fr 70px 90px;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(6, 182, 212, 0.1);
  color: #94a3b8;
  font-size: 11px;
  transition: all 0.2s ease;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row:hover {
  background: rgba(6, 182, 212, 0.05);
}

.col-equip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #cbd5e1;
}

.col-material {
  display: flex;
  align-items: center;
  gap: 6px;
}

.row-icon {
  color: #64748b;
}

.col-weight {
  text-align: right;
  font-weight: 600;
  color: #10b981;
}

.col-time {
  text-align: right;
  color: #64748b;
}

.empty-state,
.loading-state {
  text-align: center;
  padding: 30px;
  color: #475569;
  font-size: 12px;
}

::-webkit-scrollbar {
  width: 4px;
}

::-webkit-scrollbar-track {
  background: rgba(3, 15, 40, 0.4);
}

::-webkit-scrollbar-thumb {
  background: rgba(6, 182, 212, 0.3);
  border-radius: 2px;
}
</style>