<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue';
import { useAgentDashboardStats } from '../composables/useAgentDashboardStats';
import { useMachineReports } from '../composables/useMachineReports';
import { useAuthStore } from '../stores/auth';
import { 
  AlertTriangle, AlertCircle, WifiOff, Printer, 
  Server, Clock, ToggleLeft, ToggleRight, 
  Package, Target, PieChart, Activity, 
  Wrench, Truck, CheckCircle, XCircle,
  QrCode, ClipboardList, RefreshCw, MapPin,
  Bell, Gauge, Database, Wallet
} from 'lucide-vue-next';

// Init
const auth = useAuthStore();
const {
  loading,
  loadingLive,
  lastUpdated,
  alerts,
  verificationQueue,
  agentMachines,
  collectionStats,
  agentLogs,
  fetchAgentStats,
  verifySubmission,
  toggleMachineStatus,
  reportIssue,
  startAutoRefresh,
  stopAutoRefresh
} = useAgentDashboardStats();

// Machine Reports (Persistent Critical Alerts from Agent Reports)
const {
  machineReports,
  fetchMachineReports,
  updateReportStatus
} = useMachineReports();

// Combined Critical Alerts (auto-generated + agent reports)
const allCriticalAlerts = computed(() => {
  const autoAlerts = alerts.value.filter(a => a.severity === 'critical').slice(0, 5);
  const agentReports = machineReports.value.slice(0, 5).map(r => ({
    id: r.id,
    machine_id: r.machine_id,
    machine_name: r.machines?.name || r.device_no,
    device_no: r.device_no,
    alert_type: r.report_type,
    message: r.description,
    severity: r.severity,
    created_at: r.created_at,
    isPersistent: true
  }));
  
  // Combine and sort by date
  return [...autoAlerts, ...agentReports].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 10);
});

// Quick Actions Modal
const showIssueModal = ref(false);
const selectedMachineId = ref<number | null>(null);
const issueType = ref('MAINTENANCE');
const issueDescription = ref('');
const isSubmittingIssue = ref(false);

// Computed
const criticalAlerts = computed(() => allCriticalAlerts.value);
const pendingVerifications = computed(() => verificationQueue.value.slice(0, 3));

const dailyProgressPercent = computed(() => {
  if (collectionStats.value.daily_target === 0) return 0;
  return Math.min(100, Math.round((collectionStats.value.total_collected_today / collectionStats.value.daily_target) * 100));
});

const materialBreakdown = computed(() => {
  const total = collectionStats.value.pet_bottles + collectionStats.value.aluminum_cans;
  if (total === 0) return { pet: 50, alu: 50 };
  return {
    pet: Math.round((collectionStats.value.pet_bottles / total) * 100),
    alu: Math.round((collectionStats.value.aluminum_cans / total) * 100)
  };
});

// Alert icon mapping
const getAlertIcon = (type: string) => {
  switch (type) {
    case 'BIN_FULL': return AlertTriangle;
    case 'PRINTER_JAM': return Printer;
    case 'NETWORK_DISCONNECTED': return WifiOff;
    case 'MAINTENANCE': return Wrench;
    default: return AlertCircle;
  }
};

const getAlertColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'bg-red-50 border-red-200 text-red-700';
    case 'warning': return 'bg-amber-50 border-amber-200 text-amber-700';
    default: return 'bg-blue-50 border-blue-200 text-blue-700';
  }
};

// Format time
const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString();
};

// Format last updated time
const formatLastUpdated = computed(() => {
  if (!lastUpdated.value) return 'Never';
  const now = new Date();
  const diff = now.getTime() - lastUpdated.value.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  return lastUpdated.value.toLocaleTimeString();
});

// Handle manual refresh with live data
const handleRefresh = async () => {
  await fetchAgentStats(true); // Force live refresh
};

// Handle verification
const handleVerify = async (id: string, approved: boolean) => {
  await verifySubmission(id, approved);
};

// Handle machine toggle
const handleToggleMachine = async (machineId: number, currentStatus: boolean) => {
  await toggleMachineStatus(machineId, currentStatus);
};

// Open issue modal
const openIssueModal = (machineId?: number) => {
  selectedMachineId.value = machineId || null;
  issueType.value = 'MAINTENANCE';
  issueDescription.value = '';
  showIssueModal.value = true;
};

// Submit issue
const submitIssue = async () => {
  if (!selectedMachineId.value || !issueDescription.value) return;
  isSubmittingIssue.value = true;
  const success = await reportIssue(selectedMachineId.value, issueType.value, issueDescription.value);
  isSubmittingIssue.value = false;
  if (success) {
    showIssueModal.value = false;
    issueDescription.value = '';
    // Refresh machine reports to show the new report
    await fetchMachineReports();
  } else {
    alert('Failed to submit issue. Please try again.');
  }
};

// Scan QR placeholder
const handleScanQR = () => {
  alert('QR Scanner feature - Point camera at machine QR code');
};

// Initial fetch and auto-refresh
onMounted(async () => {
  // Initial fetch with live data
  await fetchAgentStats(true);
  
  // Also fetch machine reports (persistent agent reports for Critical Alerts)
  await fetchMachineReports();
  
  // Start auto-refresh (every 30 seconds)
  startAutoRefresh();
});

// Cleanup on unmount
onUnmounted(() => {
  stopAutoRefresh();
});

// Watch for auth
watch(() => auth.loading, (isLoading) => {
  if (!isLoading) {
    fetchAgentStats();
    fetchMachineReports();
  }
});

watch(() => auth.role, () => {
  fetchAgentStats();
  fetchMachineReports();
});
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Header with Quick Actions -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold text-gray-900">Agent Dashboard</h2>
        <p class="text-sm text-gray-500">Field operations and machine management</p>
      </div>
      <div class="flex items-center gap-3">
        <!-- Last Updated Indicator -->
        <div class="flex items-center gap-2 text-xs text-gray-500 mr-2">
          <Clock :size="14" />
          <span>{{ formatLastUpdated }}</span>
          <span v-if="loadingLive" class="text-blue-600">Syncing...</span>
        </div>
        <button 
          @click="handleScanQR"
          class="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition shadow-sm text-sm font-bold"
        >
          <QrCode :size="18" />
          Scan QR
        </button>
        <button 
          @click="handleRefresh"
          :disabled="loadingLive"
          class="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition shadow-sm text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw :size="16" :class="{ 'animate-spin': loading || loadingLive }" />
          {{ loadingLive ? 'Syncing...' : 'Refresh' }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && agentMachines.length === 0" class="flex h-64 items-center justify-center">
      <div class="text-gray-400 animate-pulse font-medium">Loading Agent Dashboard...</div>
    </div>

    <div v-else>
      <!-- SUMMARY CARDS -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <!-- Active Alerts -->
        <div class="bg-white rounded-xl shadow-sm border p-5">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Alerts</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ collectionStats.active_alerts_count }}</p>
              <p class="text-xs text-gray-400 mt-1">Requires Immediate Action</p>
            </div>
            <div class="p-2 rounded-lg" :class="collectionStats.active_alerts_count > 0 ? 'bg-red-100' : 'bg-gray-100'">
              <Bell :size="20" :class="collectionStats.active_alerts_count > 0 ? 'text-red-600' : 'text-gray-500'" />
            </div>
          </div>
          <div v-if="collectionStats.active_alerts_count > 0" class="mt-3 flex items-center text-xs text-red-600">
            <AlertTriangle :size="12" class="mr-1" />
            <span>Bin Full, Printer Jam, or Offline</span>
          </div>
        </div>

        <!-- Near Capacity -->
        <div class="bg-white rounded-xl shadow-sm border p-5">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Near Capacity</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ collectionStats.near_capacity_count }}</p>
              <p class="text-xs text-gray-400 mt-1">&gt; 80% Fill Level</p>
            </div>
            <div class="p-2 rounded-lg bg-amber-100">
              <Gauge :size="20" class="text-amber-600" />
            </div>
          </div>
          <div class="mt-3 flex items-center text-xs text-amber-600">
            <MapPin :size="12" class="mr-1" />
            <span>Notify collector when full</span>
          </div>
        </div>

        <!-- Online Units -->
        <div class="bg-white rounded-xl shadow-sm border p-5">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Online Units</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ collectionStats.online_units_count }}</p>
              <p class="text-xs text-gray-400 mt-1">Ready for Use</p>
            </div>
            <div class="p-2 rounded-lg bg-green-100">
              <Database :size="20" class="text-green-600" />
            </div>
          </div>
          <div class="mt-3 flex items-center text-xs text-green-600">
            <Server :size="12" class="mr-1" />
            <span>Communicating with server</span>
          </div>
        </div>

        <!-- Incentives Issued -->
        <div class="bg-white rounded-xl shadow-sm border p-5">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Incentives Issued</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ collectionStats.incentives_issued.toFixed(0) }}</p>
              <p class="text-xs text-gray-400 mt-1">Points Distributed</p>
            </div>
            <div class="p-2 rounded-lg bg-purple-100">
              <Wallet :size="20" class="text-purple-600" />
            </div>
          </div>
          <div class="mt-3 flex items-center text-xs text-purple-600">
            <Activity :size="12" class="mr-1" />
            <span>Today's rewards to users</span>
          </div>
        </div>
      </div>

      <!-- 1. ACTIVE ALERTS & URGENT TASKS -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Critical Alerts -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle :size="20" class="text-red-600" />
              Critical Alerts
              <span v-if="criticalAlerts.length > 0" class="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
                {{ criticalAlerts.length }}
              </span>
            </h3>
          </div>
          <div class="space-y-3">
            <div 
              v-for="alert in criticalAlerts" 
              :key="alert.id"
              class="p-3 rounded-xl border flex items-start gap-3"
              :class="getAlertColor(alert.severity)"
            >
              <component :is="getAlertIcon(alert.alert_type)" :size="20" class="shrink-0 mt-0.5" />
              <div class="flex-1 min-w-0">
                <p class="font-bold text-sm">{{ alert.machine_name }}</p>
                <p class="text-xs opacity-80">{{ alert.message }}</p>
                <p class="text-xs mt-1 opacity-60">{{ formatTime(alert.created_at) }}</p>
              </div>
            </div>
            <div v-if="criticalAlerts.length === 0" class="text-center py-4 text-gray-400 text-sm">
              No critical alerts
            </div>
          </div>
        </div>

        <!-- Verification Queue -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
              <CheckCircle :size="20" class="text-amber-600" />
              Verification Queue
              <span v-if="pendingVerifications.length > 0" class="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                {{ pendingVerifications.length }}
              </span>
            </h3>
          </div>
          <div class="space-y-3">
            <div 
              v-for="item in pendingVerifications" 
              :key="item.id"
              class="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition"
            >
              <div class="h-12 w-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                <img v-if="item.photo_url" :src="item.photo_url" class="h-full w-full object-cover" />
                <Package v-else :size="20" class="m-2 text-gray-400" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-gray-900 truncate">{{ item.users?.nickname || 'Guest' }}</p>
                <p class="text-xs text-gray-500">{{ item.waste_type }} • {{ item.api_weight }}kg</p>
              </div>
              <div class="flex gap-2">
                <button 
                  @click="handleVerify(item.id, true)"
                  class="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition"
                  title="Approve"
                >
                  <CheckCircle :size="16" />
                </button>
                <button 
                  @click="handleVerify(item.id, false)"
                  class="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                  title="Reject"
                >
                  <XCircle :size="16" />
                </button>
              </div>
            </div>
            <div v-if="pendingVerifications.length === 0" class="text-center py-4 text-gray-400 text-sm">
              No pending verifications
            </div>
          </div>
        </div>
      </div>

      <!-- 2. MACHINE PERFORMANCE METRICS -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Server :size="20" class="text-blue-600" />
            Machine Performance
          </h3>
          <span class="text-xs text-gray-500">{{ agentMachines.length }} machines assigned</span>
        </div>
        
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-xs text-gray-500 border-b">
                <th class="pb-3 font-medium">Machine</th>
                <th class="pb-3 font-medium">Fill Level</th>
                <th class="pb-3 font-medium">Last Heartbeat</th>
                <th class="pb-3 font-medium">Status</th>
                <th class="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="machine in agentMachines" :key="machine.id" class="border-b border-gray-50 last:border-0">
                <td class="py-4">
                  <div class="flex items-center gap-2">
                    <MapPin :size="14" class="text-gray-400" />
                    <div>
                      <p class="font-bold text-sm text-gray-900">{{ machine.name }}</p>
                      <p class="text-xs text-gray-500">{{ machine.device_no }}</p>
                    </div>
                  </div>
                </td>
                <td class="py-4">
                  <div class="space-y-1">
                    <div v-for="(comp, idx) in machine.compartments" :key="idx" class="flex items-center gap-2">
                      <span class="text-xs text-gray-500 w-16">{{ comp.label }}</span>
                      <div class="flex-1 max-w-[100px] h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          class="h-full rounded-full transition-all"
                          :class="comp.isFull ? 'bg-red-500' : comp.percent > 70 ? 'bg-amber-500' : 'bg-green-500'"
                          :style="{ width: `${comp.percent}%` }"
                        ></div>
                      </div>
                      <span class="text-xs font-medium" :class="comp.isFull ? 'text-red-600' : 'text-gray-600'">
                        {{ comp.percent }}%
                      </span>
                    </div>
                  </div>
                </td>
                <td class="py-4">
                  <div class="flex items-center gap-1 text-sm text-gray-600">
                    <Clock :size="14" />
                    {{ machine.lastHeartbeat }}
                  </div>
                </td>
                <td class="py-4">
                  <span 
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                    :class="machine.isOnline ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'"
                  >
                    <span class="w-1.5 h-1.5 rounded-full" :class="machine.isOnline ? 'bg-green-500' : 'bg-gray-400'"></span>
                    {{ machine.isOnline ? 'Online' : 'Offline' }}
                  </span>
                </td>
                <td class="py-4">
                  <button 
                    @click="handleToggleMachine(machine.id, machine.is_manual_offline)"
                    class="flex items-center gap-1 text-xs font-medium"
                    :class="machine.is_manual_offline ? 'text-amber-600' : 'text-gray-600 hover:text-amber-600'"
                  >
                    <component :is="machine.is_manual_offline ? ToggleRight : ToggleLeft" :size="16" />
                    {{ machine.is_manual_offline ? 'Disabled' : 'Disable' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="agentMachines.length === 0" class="text-center py-8 text-gray-400 text-sm">
            No machines assigned to you
          </div>
        </div>
      </div>

      <!-- 3. COLLECTION & IMPACT DATA -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <!-- Daily Target Progress Ring -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
            <Target :size="20" class="text-purple-600" />
            Daily Target
          </h3>
          <div class="flex items-center justify-center">
            <div class="relative w-32 h-32">
              <svg class="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50" cy="50" r="40"
                  fill="none"
                  stroke="#e5e7eb"
                  stroke-width="10"
                />
                <circle
                  cx="50" cy="50" r="40"
                  fill="none"
                  :stroke="dailyProgressPercent >= 100 ? '#10b981' : '#8b5cf6'"
                  stroke-width="10"
                  stroke-linecap="round"
                  :stroke-dasharray="`${dailyProgressPercent * 2.51} 251`"
                  class="transition-all duration-500"
                />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-2xl font-bold text-gray-900">{{ dailyProgressPercent }}%</span>
                <span class="text-xs text-gray-500">of target</span>
              </div>
            </div>
          </div>
          <div class="mt-4 text-center">
            <p class="text-sm text-gray-600">
              {{ collectionStats.total_collected_today.toFixed(1) }}kg / {{ collectionStats.daily_target }}kg
            </p>
            <p class="text-xs text-gray-400 mt-1">
              Daily avg: {{ collectionStats.daily_average.toFixed(1) }}kg
            </p>
          </div>
        </div>

        <!-- Material Breakdown Pie -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
            <PieChart :size="20" class="text-green-600" />
            Material Breakdown
          </h3>
          <div class="flex items-center justify-center">
            <div class="relative w-32 h-32">
              <svg class="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50" cy="50" r="40"
                  fill="none"
                  stroke="#22c55e"
                  stroke-width="20"
                  :stroke-dasharray="`${materialBreakdown.pet * 2.51} 251`"
                  class="transition-all duration-500"
                />
                <circle
                  cx="50" cy="50" r="40"
                  fill="none"
                  stroke="#3b82f6"
                  stroke-width="20"
                  :stroke-dasharray="`${materialBreakdown.alu * 2.51} 251`"
                  :stroke-dashoffset="`-${materialBreakdown.pet * 2.51}`"
                  class="transition-all duration-500"
                />
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <Package :size="24" class="text-gray-400" />
              </div>
            </div>
          </div>
          <div class="mt-4 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-green-500"></span>
                <span class="text-sm text-gray-600">PET Bottles</span>
              </div>
              <span class="text-sm font-bold text-gray-900">{{ materialBreakdown.pet }}%</span>
            </div>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-blue-500"></span>
                <span class="text-sm text-gray-600">Aluminum Cans</span>
              </div>
              <span class="text-sm font-bold text-gray-900">{{ materialBreakdown.alu }}%</span>
            </div>
          </div>
        </div>

        <!-- Total Collected -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
            <Activity :size="20" class="text-amber-600" />
            Today's Impact
          </h3>
          <div class="space-y-4">
            <div class="p-4 bg-green-50 rounded-xl">
              <p class="text-2xl font-bold text-green-700">{{ collectionStats.pet_bottles }}</p>
              <p class="text-xs text-green-600">PET Bottles Collected</p>
            </div>
            <div class="p-4 bg-blue-50 rounded-xl">
              <p class="text-2xl font-bold text-blue-700">{{ collectionStats.aluminum_cans }}</p>
              <p class="text-xs text-blue-600">Aluminum Cans Collected</p>
            </div>
            <div class="p-4 bg-purple-50 rounded-xl">
              <p class="text-2xl font-bold text-purple-700">{{ (collectionStats.plastic_weight + collectionStats.aluminum_weight).toFixed(1) }}kg</p>
              <p class="text-xs text-purple-600">Total Weight</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. AGENT-SPECIFIC LOGS -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList :size="20" class="text-slate-600" />
            Recent Activity Logs
          </h3>
        </div>
        <div class="space-y-3">
          <div 
            v-for="log in agentLogs.slice(0, 10)" 
            :key="log.id"
            class="flex items-center gap-4 p-3 rounded-xl border border-gray-50 hover:bg-gray-50 transition"
          >
            <div 
              class="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
              :class="log.log_type === 'MAINTENANCE' ? 'bg-amber-100 text-amber-600' : 
                     log.log_type === 'COLLECTION' ? 'bg-green-100 text-green-600' :
                     log.log_type === 'ISSUE_REPORTED' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'"
            >
              <component 
                :is="log.log_type === 'MAINTENANCE' ? Wrench : 
                     log.log_type === 'COLLECTION' ? Truck :
                     log.log_type === 'ISSUE_REPORTED' ? AlertTriangle : Activity" 
                :size="18" 
              />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-gray-900">{{ log.machine_name }}</p>
              <p class="text-xs text-gray-500">{{ log.description }}</p>
            </div>
            <div class="text-right shrink-0">
              <p class="text-xs font-medium text-gray-600">{{ log.performed_by }}</p>
              <p class="text-xs text-gray-400">{{ formatTime(log.created_at) }}</p>
            </div>
          </div>
          <div v-if="agentLogs.length === 0" class="text-center py-6 text-gray-400 text-sm">
            No recent activity
          </div>
        </div>
      </div>

      <!-- Quick Actions Floating Menu -->
      <div class="fixed bottom-6 right-6 flex flex-col gap-2">
        <button 
          @click="showIssueModal = true"
          class="flex items-center gap-3 bg-red-600 text-white px-4 py-3 rounded-full shadow-lg hover:bg-red-700 transition transform hover:scale-105"
        >
          <ClipboardList :size="20" />
          <span class="font-bold">Report Issue</span>
        </button>
      </div>
    </div>

    <!-- Issue Report Modal -->
    <div v-if="showIssueModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showIssueModal = false">
      <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Report Issue</h3>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Select Machine</label>
            <select 
              v-model="selectedMachineId"
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option :value="null" disabled>Choose a machine...</option>
              <option v-for="machine in agentMachines" :key="machine.id" :value="machine.id">
                {{ machine.name }} ({{ machine.device_no }})
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Issue Type</label>
            <select 
              v-model="issueType"
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="MAINTENANCE">Maintenance Required</option>
              <option value="BIN_FULL">Bin Full</option>
              <option value="PRINTER_JAM">Printer Jam</option>
              <option value="NETWORK_ISSUE">Network Issue</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea 
              v-model="issueDescription"
              rows="3"
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe the issue..."
            ></textarea>
          </div>
        </div>
        
        <div class="flex gap-3 mt-6">
          <button 
            @click="showIssueModal = false"
            class="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button 
            @click="submitIssue"
            class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!selectedMachineId || !issueDescription || isSubmittingIssue"
          >
            {{ isSubmittingIssue ? 'Submitting...' : 'Submit Report' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
