<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { TrendingUp, Package, Coins, FileText, UserPlus, RefreshCw } from 'lucide-vue-next';

type TimePeriod = 'day' | 'week' | 'month';

interface ComparisonData {
  deliveryVolume: number;
  totalExpenses: number;
  submissionCount: number;
  newUserCount: number;
}

const period = ref<TimePeriod>('day');
const isLoading = ref(false);
const lastUpdated = ref<Date | null>(null);
const current = ref<ComparisonData>({
  deliveryVolume: 0,
  totalExpenses: 0,
  submissionCount: 0,
  newUserCount: 0
});
const previous = ref<ComparisonData>({
  deliveryVolume: 0,
  totalExpenses: 0,
  submissionCount: 0,
  newUserCount: 0
});

let pollInterval: ReturnType<typeof setInterval> | null = null;

const fetchComparison = async () => {
  isLoading.value = true;
  try {
    const response = await fetch(`/api/stats/comparison?period=${period.value}`);
    const result = await response.json();
    
    if (result.success) {
      current.value = result.current;
      previous.value = result.previous;
      lastUpdated.value = new Date();
    }
  } catch (error) {
    console.log('Using demo comparison data');
    if (period.value === 'day') {
      current.value = { deliveryVolume: 1250, totalExpenses: 6250, submissionCount: 156, newUserCount: 12 };
      previous.value = { deliveryVolume: 980, totalExpenses: 4900, submissionCount: 122, newUserCount: 8 };
    } else if (period.value === 'week') {
      current.value = { deliveryVolume: 8750, totalExpenses: 43750, submissionCount: 1092, newUserCount: 67 };
      previous.value = { deliveryVolume: 7200, totalExpenses: 36000, submissionCount: 900, newUserCount: 54 };
    } else {
      current.value = { deliveryVolume: 37500, totalExpenses: 187500, submissionCount: 4680, newUserCount: 285 };
      previous.value = { deliveryVolume: 31200, totalExpenses: 156000, submissionCount: 3900, newUserCount: 240 };
    }
    lastUpdated.value = new Date();
  } finally {
    isLoading.value = false;
  }
};

const setPeriod = (p: TimePeriod) => {
  period.value = p;
  fetchComparison();
};

const formatNumber = (num: any, isInteger = false): string => {
  const n = Number(num);
  if (isNaN(n)) return isInteger ? '0' : '0.00';
  
  if (isInteger) {
    return n.toLocaleString('en-MY');
  }
  
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(2) + 'K';
  return n.toFixed(2);
};

const getChange = (curr: number, prev: number): { value: string; isPositive: boolean } => {
  if (prev === 0) return { value: curr > 0 ? '+100%' : '0%', isPositive: curr > 0 };
  const change = ((curr - prev) / prev) * 100;
  const sign = change >= 0 ? '+' : '';
  return { value: `${sign}${change.toFixed(1)}%`, isPositive: change >= 0 };
};

const startPolling = () => {
  if (pollInterval) return;
  fetchComparison();
  pollInterval = setInterval(fetchComparison, 30000);
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

onMounted(() => {
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="comparison-summary">
    <div class="cs-header">
      <TrendingUp :size="16" />
      <span>COMPARISON SUMMARY</span>
      <div class="live-indicator">
        <RefreshCw :size="12" :class="{ spinning: isLoading }" />
        <span class="time">{{ formatTime(lastUpdated) }}</span>
      </div>
    </div>

    <div class="period-toggle">
      <button 
        v-for="p in ['day', 'week', 'month'] as TimePeriod[]"
        :key="p"
        @click="setPeriod(p)"
        :class="['period-btn', { active: period === p }]"
      >
        {{ p.toUpperCase() }}
      </button>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-icon">
          <Package :size="14" />
        </div>
        <div class="metric-label">DELIVERY VOLUME</div>
        <div class="metric-current">{{ formatNumber(current.deliveryVolume) }}kg</div>
        <div class="metric-previous">{{ formatNumber(previous.deliveryVolume) }}kg</div>
        <div 
          class="metric-change"
          :class="{ positive: getChange(current.deliveryVolume, previous.deliveryVolume).isPositive }"
        >
          {{ getChange(current.deliveryVolume, previous.deliveryVolume).value }}
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">
          <Coins :size="14" />
        </div>
        <div class="metric-label">TOTAL EXPENSES</div>
        <div class="metric-current">{{ formatNumber(current.totalExpenses) }}</div>
        <div class="metric-previous">{{ formatNumber(previous.totalExpenses) }}</div>
        <div 
          class="metric-change"
          :class="{ positive: getChange(current.totalExpenses, previous.totalExpenses).isPositive }"
        >
          {{ getChange(current.totalExpenses, previous.totalExpenses).value }}
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">
          <FileText :size="14" />
        </div>
        <div class="metric-label">SUBMISSIONS</div>
        <div class="metric-current">{{ formatNumber(current.submissionCount, true) }}</div>
        <div class="metric-previous">{{ formatNumber(previous.submissionCount, true) }}</div>
        <div 
          class="metric-change"
          :class="{ positive: getChange(current.submissionCount, previous.submissionCount).isPositive }"
        >
          {{ getChange(current.submissionCount, previous.submissionCount).value }}
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">
          <UserPlus :size="14" />
        </div>
        <div class="metric-label">NEW USERS</div>
        <div class="metric-current">{{ formatNumber(current.newUserCount, true) }}</div>
        <div class="metric-previous">{{ formatNumber(previous.newUserCount, true) }}</div>
        <div 
          class="metric-change"
          :class="{ positive: getChange(current.newUserCount, previous.newUserCount).isPositive }"
        >
          {{ getChange(current.newUserCount, previous.newUserCount).value }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comparison-summary {
  background: rgba(6, 30, 75, 0.85);
  border: 1px solid rgba(6, 182, 212, 0.3);
  border-radius: 12px;
  padding: 16px;
}

.cs-header {
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

.period-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.period-btn {
  flex: 1;
  padding: 8px 12px;
  background: rgba(6, 30, 75, 0.6);
  border: 1px solid rgba(6, 182, 212, 0.2);
  border-radius: 6px;
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.period-btn:hover {
  border-color: rgba(6, 182, 212, 0.5);
  color: #94a3b8;
}

.period-btn.active {
  background: rgba(6, 182, 212, 0.15);
  border-color: #06b6d4;
  color: #06b6d4;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.metric-card {
  background: rgba(3, 15, 40, 0.6);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid rgba(6, 182, 212, 0.1);
}

.metric-icon {
  width: 28px;
  height: 28px;
  background: rgba(6, 182, 212, 0.15);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #06b6d4;
  margin-bottom: 8px;
}

.metric-label {
  font-size: 9px;
  color: #64748b;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.metric-current {
  font-size: 18px;
  font-weight: 700;
  color: #06b6d4;
  text-shadow: 0 0 10px rgba(6, 182, 212, 0.5);
  margin-bottom: 2px;
}

.metric-previous {
  font-size: 10px;
  color: #475569;
  margin-bottom: 4px;
}

.metric-change {
  font-size: 11px;
  font-weight: 600;
  color: #ef4444;
}

.metric-change.positive {
  color: #10b981;
}
</style>