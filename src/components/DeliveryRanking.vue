<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Trophy, User, Server, RefreshCw } from 'lucide-vue-next';

type RankingType = 'user' | 'equipment';

interface RankingItem {
  rank: number;
  id?: string;
  username?: string;
  deviceNo?: string;
  phone?: string;
  totalWeight: number;
}

const rankingType = ref<RankingType>('user');
const rankings = ref<RankingItem[]>([]);
const isLoading = ref(false);
const lastUpdated = ref<Date | null>(null);
const isUpdating = ref(false);

let pollInterval: ReturnType<typeof setInterval> | null = null;

const fetchRankings = async () => {
  isLoading.value = true;
  try {
    const response = await fetch(`/api/stats/rankings?type=${rankingType.value}`);
    const result = await response.json();
    
    if (result.success && result.rankings) {
      const oldTop = rankings.value[0]?.totalWeight || 0;
      rankings.value = result.rankings;
      lastUpdated.value = new Date();
      
      if (result.rankings[0]?.totalWeight > oldTop && lastUpdated.value) {
        isUpdating.value = true;
        setTimeout(() => { isUpdating.value = false; }, 1500);
      }
    }
  } catch (error) {
    console.log('Using demo ranking data');
    if (rankingType.value === 'user') {
      rankings.value = [
        { rank: 1, id: '1', username: 'Ahmad R.', phone: '011****5157', totalWeight: 1250.5 },
        { rank: 2, id: '2', username: 'Sarah L.', phone: '012****8234', totalWeight: 1080.2 },
        { rank: 3, id: '3', username: 'Mike T.', phone: '017****4567', totalWeight: 945.8 },
        { rank: 4, id: '4', username: 'Jenny K.', phone: '013****9876', totalWeight: 820.3 },
        { rank: 5, id: '5', username: 'David W.', phone: '016****2345', totalWeight: 715.6 },
        { rank: 6, id: '6', username: 'Lisa M.', phone: '019****8765', totalWeight: 620.1 },
        { rank: 7, id: '7', username: 'John D.', phone: '014****5432', totalWeight: 540.9 },
        { rank: 8, id: '8', username: 'Amy S.', phone: '018****1098', totalWeight: 480.4 },
        { rank: 9, id: '9', username: 'Bob R.', phone: '015****6789', totalWeight: 425.7 },
        { rank: 10, id: '10', username: 'Chris P.', phone: '010****3210', totalWeight: 380.2 }
      ];
    } else {
      rankings.value = [
        { rank: 1, deviceNo: 'RVM-001', totalWeight: 3250.0 },
        { rank: 2, deviceNo: 'RVM-003', totalWeight: 2890.5 },
        { rank: 3, deviceNo: 'RVM-007', totalWeight: 2450.8 },
        { rank: 4, deviceNo: 'RVM-002', totalWeight: 2100.3 },
        { rank: 5, deviceNo: 'RVM-005', totalWeight: 1850.6 },
        { rank: 6, deviceNo: 'RVM-008', totalWeight: 1620.1 },
        { rank: 7, deviceNo: 'RVM-004', totalWeight: 1480.9 },
        { rank: 8, deviceNo: 'RVM-006', totalWeight: 1250.4 },
        { rank: 9, deviceNo: 'RVM-009', totalWeight: 980.7 },
        { rank: 10, deviceNo: 'RVM-010', totalWeight: 750.2 }
      ];
    }
    lastUpdated.value = new Date();
  } finally {
    isLoading.value = false;
  }
};

const switchType = (type: RankingType) => {
  rankingType.value = type;
  fetchRankings();
};

const startPolling = () => {
  if (pollInterval) return;
  fetchRankings();
  pollInterval = setInterval(fetchRankings, 5000);
};

const stopPolling = () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
};

const formatTime = (date: Date | null) => {
  if (!date) return '--:--';
  return date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

watch(rankingType, () => {
  fetchRankings();
});

onMounted(() => {
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="delivery-ranking" :class="{ updating: isUpdating }">
    <div class="rank-header">
      <Trophy :size="16" />
      <span>DELIVERY RANKING</span>
      <div class="live-indicator">
        <RefreshCw :size="12" :class="{ spinning: isLoading }" />
        <span class="time">{{ formatTime(lastUpdated) }}</span>
      </div>
    </div>

    <div class="type-toggle">
      <button 
        @click="switchType('user')"
        :class="['type-btn', { active: rankingType === 'user' }]"
      >
        <User :size="14" />
        USERS
      </button>
      <button 
        @click="switchType('equipment')"
        :class="['type-btn', { active: rankingType === 'equipment' }]"
      >
        <Server :size="14" />
        EQUIPMENT
      </button>
    </div>

    <div class="rank-table">
      <div class="table-header">
        <span class="col-rank">#</span>
        <span class="col-name">{{ rankingType === 'user' ? 'USERNAME' : 'MACHINE ID' }}</span>
        <span class="col-phone">{{ rankingType === 'user' ? 'PHONE' : '' }}</span>
        <span class="col-weight">WEIGHT</span>
      </div>
      
      <div class="table-body">
        <div 
          v-for="item in rankings" 
          :key="item.rank"
          :class="['table-row', { top3: item.rank <= 3 }]"
        >
          <span class="col-rank">
            <span v-if="item.rank === 1" class="medal gold">🥇</span>
            <span v-else-if="item.rank === 2" class="medal silver">🥈</span>
            <span v-else-if="item.rank === 3" class="medal bronze">🥉</span>
            <span v-else>{{ item.rank }}</span>
          </span>
          <span class="col-name">
            {{ rankingType === 'user' ? item.username : item.deviceNo }}
          </span>
          <span class="col-phone">
            {{ item.phone || '' }}
          </span>
          <span class="col-weight">
            {{ Number(item.totalWeight).toFixed(2) }}kg
          </span>
        </div>
        
        <div v-if="rankings.length === 0 && !isLoading" class="empty-state">
          No data available
        </div>
        
        <div v-if="isLoading && rankings.length === 0" class="loading-state">
          Loading rankings...
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.delivery-ranking {
  background: rgba(6, 30, 75, 0.85);
  border: 1px solid rgba(6, 182, 212, 0.3);
  border-radius: 12px;
  padding: 16px;
  transition: all 0.3s ease;
}

.delivery-ranking.updating {
  border-color: #06b6d4;
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.3);
}

.rank-header {
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

.type-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  background: rgba(6, 30, 75, 0.6);
  border: 1px solid rgba(6, 182, 212, 0.2);
  border-radius: 6px;
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.type-btn:hover {
  border-color: rgba(6, 182, 212, 0.5);
  color: #94a3b8;
}

.type-btn.active {
  background: rgba(6, 182, 212, 0.15);
  border-color: #06b6d4;
  color: #06b6d4;
}

.rank-table {
  background: rgba(3, 15, 40, 0.6);
  border-radius: 8px;
  overflow: hidden;
}

.table-header {
  display: grid;
  grid-template-columns: 40px 1fr 1fr 70px;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(6, 182, 212, 0.1);
  border-bottom: 1px solid rgba(6, 182, 212, 0.2);
  color: #06b6d4;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.table-body {
  max-height: 280px;
  overflow-y: auto;
}

.table-row {
  display: grid;
  grid-template-columns: 40px 1fr 1fr 70px;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(6, 182, 212, 0.1);
  color: #94a3b8;
  font-size: 12px;
  transition: all 0.2s ease;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row:hover {
  background: rgba(6, 182, 212, 0.05);
}

.table-row.top3 {
  color: #cbd5e1;
}

.table-row.top3 .col-weight {
  color: #06b6d4;
  font-weight: 600;
}

.col-rank {
  font-weight: 600;
  display: flex;
  align-items: center;
}

.medal {
  font-size: 16px;
}

.col-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-phone {
  font-size: 11px;
  color: #64748b;
}

.col-weight {
  text-align: right;
  font-weight: 600;
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