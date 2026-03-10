<script setup lang="ts">
import { onMounted, computed, watch, ref } from 'vue';
import { useMachineStore } from '../stores/machines';
import { useDashboardStats } from '../composables/useDashboardStats';
import { useSubmissionReviews } from '../composables/useSubmissionReviews';
import { useCleaningRecords } from '../composables/useCleaningRecords';
import { useAuthStore } from '../stores/auth';
import { supabase } from '../services/supabase';
import { storeToRefs } from 'pinia';
import { 
  AlertCircle, Server, Scale, Activity, 
  Recycle, Truck, CheckCircle2, MapPin,
  TrendingUp, Calendar, Users, Package,
  RefreshCw, Wrench, Trash2, Sparkles,
  CheckSquare, XCircle, Clock, Filter,
  Edit3, Camera, Eye, Navigation
} from 'lucide-vue-next';
import StatsCard from '../components/StatsCard.vue';
import SubmissionCorrectionModal from '../components/SubmissionCorrectionModal.vue';

const machineStore = useMachineStore();
const auth = useAuthStore();
const { machines, loading: machineLoading } = storeToRefs(machineStore);

const { 
  loading: statsLoading, 
  pendingCount, 
  totalWeight,
  totalPoints,
  recentSubmissions, 
  recentCleaning,
  fetchStats 
} = useDashboardStats();

// Submission Reviews composable for live data
const { 
  isHarvesting,
  fetchReviews,
  harvestNewSubmissions
} = useSubmissionReviews();

// Cleaning Records
const { records: cleaningRecords, fetchCleaningLogs } = useCleaningRecords();

// Collector-specific: Enhanced stats
const collectorStats = ref({
  todaySubmissions: 0,
  todayWeight: 0,
  verifiedCount: 0,
  rejectedCount: 0,
  totalSubmissions: 0,
  cleaningRecordsCount: 0,
  avgWeightPerSubmission: 0,
  pendingVerifications: 0,
  highPriorityMachines: 0
});

// Machine with last cleaned timestamp
interface MachineWithCleaned extends Record<string, any> {
  lastCleaned?: string;
  needsCollection?: boolean;
  needsCleaning?: boolean;
}

const machinesWithCleaned = ref<MachineWithCleaned[]>([]);

// Fetch collector-specific enhanced stats
const fetchCollectorStats = async () => {
  try {
    const auth = useAuthStore();
    const userRole = auth.role;
    const userMerchantId = auth.merchantId;
    
    // Build base query filters
    let submissionQuery = supabase.from('submission_reviews').select('*', { count: 'exact', head: true });
    let cleaningQuery = supabase.from('cleaning_records').select('*', { count: 'exact', head: true });
    
    // Apply merchant filter if not VIEWER, COLLECTOR, or AGENT
    if (userRole !== 'VIEWER' && userRole !== 'COLLECTOR' && userRole !== 'AGENT' && userMerchantId) {
      submissionQuery = submissionQuery.eq('merchant_id', userMerchantId);
      cleaningQuery = cleaningQuery.eq('merchant_id', userMerchantId);
    }
    
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();
    
    // 1. Today's submissions count
    const { count: todaySubCount } = await submissionQuery
      .gte('submitted_at', todayStr);
    
    // 2. Today's weight
    const { data: todayWeightData } = await supabase
      .from('submission_reviews')
      .select('api_weight')
      .gte('submitted_at', todayStr);
    
    const todayWeight = todayWeightData?.reduce((sum, r) => sum + (Number(r.api_weight) || 0), 0) || 0;
    
    // 3. Total submissions count
    const { count: totalSubCount } = await submissionQuery;
    
    // 4. Verified count
    const { count: verifiedCount } = await supabase
      .from('submission_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'VERIFIED');
    
    // 5. Rejected count - today's only for daily scorecard
    const { count: rejectedCount } = await supabase
      .from('submission_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'REJECTED')
      .gte('submitted_at', todayStr);
    
    // 6. Total cleaning records
    const { count: cleaningCount } = await cleaningQuery;
    
    // 7. Pending verifications (PENDING status)
    const { count: pendingVerifCount } = await supabase
      .from('submission_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PENDING');
    
    // 8. High priority machines (bins >= 90% full or offline)
    const highPriorityMachines = machines.value.filter(m => {
      const hasHighFill = m.compartments?.some((c: any) => c.percent >= 90);
      return !m.isOnline || hasHighFill || m.statusText === 'Bin Full';
    }).length;
    
    // 9. Calculate average weight per submission
    const avgWeight = totalSubCount && totalSubCount > 0 
      ? (todayWeightData?.reduce((sum, r) => sum + (Number(r.api_weight) || 0), 0) || 0) / (totalSubCount || 1)
      : 0;
    
    collectorStats.value = {
      todaySubmissions: todaySubCount || 0,
      todayWeight: todayWeight,
      verifiedCount: verifiedCount || 0,
      rejectedCount: rejectedCount || 0,
      totalSubmissions: totalSubCount || 0,
      cleaningRecordsCount: cleaningCount || 0,
      avgWeightPerSubmission: avgWeight,
      pendingVerifications: pendingVerifCount || 0,
      highPriorityMachines
    };
    
    console.log('Collector Stats:', collectorStats.value);
  } catch (err) {
    console.error('Error fetching collector stats:', err);
  }
};

// Fetch last cleaned timestamps for each machine
const fetchLastCleanedTimestamps = async () => {
  try {
    const { data, error } = await supabase
      .from('cleaning_records')
      .select('device_no, cleaned_at')
      .order('cleaned_at', { ascending: false });
    
    if (error) throw error;
    
    // Group by device_no and get latest
    const lastCleanedMap = new Map<string, string>();
    data?.forEach(record => {
      if (!lastCleanedMap.has(record.device_no)) {
        lastCleanedMap.set(record.device_no, record.cleaned_at);
      }
    });
    
    // Merge with machines
    machinesWithCleaned.value = machines.value.map(m => ({
      ...m,
      lastCleaned: lastCleanedMap.get(m.deviceNo) || undefined,
      // Determine needs
      needsCollection: m.compartments?.some((c: any) => c.percent >= 90) || m.statusText === 'Bin Full',
      needsCleaning: m.statusText === 'Maintenance' || !m.isOnline
    }));
  } catch (err) {
    console.error('Error fetching last cleaned:', err);
    machinesWithCleaned.value = machines.value;
  }
};

// Machine status for collection route
const machinesNeedingAttention = computed(() => {
  return machines.value.filter(m => !m.isOnline).length;
});

const onlineMachinesCount = computed(() => machines.value.filter((m) => m.isOnline).length);

// Sorting options for machine list
type SortOption = 'urgency' | 'distance' | 'name';
const sortBy = ref<SortOption>('urgency');

// Sorted machines by priority
const sortedMachines = computed(() => {
  let sorted = [...machinesWithCleaned.value];
  
  if (sortBy.value === 'urgency') {
    // Sort by: Offline first, then full bins (90%+), then by fill level descending
    sorted.sort((a, b) => {
      // Offline machines first
      if (!a.isOnline && b.isOnline) return -1;
      if (b.isOnline && !a.isOnline) return 1;
      
      // Then by bin fullness (max percent)
      const aMaxFill = Math.max(...(a.compartments?.map((c: any) => c.percent) || [0]));
      const bMaxFill = Math.max(...(b.compartments?.map((c: any) => c.percent) || [0]));
      
      if (aMaxFill !== bMaxFill) return bMaxFill - aMaxFill;
      
      // Then by status text priority
      const statusPriority: Record<string, number> = {
        'Bin Full': 4,
        'Maintenance': 3,
        'Offline': 2,
        'In Use': 1,
        'Online': 0
      };
      return (statusPriority[b.statusText] || 0) - (statusPriority[a.statusText] || 0);
    });
  } else if (sortBy.value === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  return sorted;
});

// Get priority machines (needs attention)
const priorityMachines = computed(() => {
  return sortedMachines.value.filter(m => 
    !m.isOnline || m.needsCollection || m.statusText === 'Bin Full'
  );
});

// Helper for status colors
const getStatusColor = (status: string) => {
  const map: Record<string, string> = {
    'PENDING': 'bg-amber-100 text-amber-700',
    'APPROVED': 'bg-green-100 text-green-700',
    'VERIFIED': 'bg-green-100 text-green-700',
    'REJECTED': 'bg-red-100 text-red-700',
    'COMPLETED': 'bg-blue-100 text-blue-700'
  };
  return map[status] || 'bg-gray-100 text-gray-700';
};

// Get fill level color
const getFillColor = (percent: number) => {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 70) return 'bg-amber-500';
  return 'bg-green-500';
};

// Format last cleaned time
const formatLastCleaned = (dateStr: string | undefined) => {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const formatNumber = (num: number) => num.toLocaleString(undefined, { maximumFractionDigits: 1 });

// Auto-refresh data
const refreshKey = ref(0);
const isRefreshing = ref(false);

const handleRefresh = () => {
  isRefreshing.value = true;
  refreshKey.value += 1;
  machineStore.fetchMachines();
  fetchStats();
  fetchCollectorStats();
  fetchReviews();
  fetchCleaningLogs();
  setTimeout(() => {
    isRefreshing.value = false;
  }, 1000);
};

const handleHarvest = (force: boolean = false) => {
  harvestNewSubmissions(force);
};

// Pending verifications for quick actions
const pendingVerifications = computed(() => {
  return recentSubmissions.value.filter(s => s.status === 'PENDING').slice(0, 5);
});

// Weight correction modal
const showWeightCorrection = ref(false);
const selectedSubmission = ref<any>(null);
const isProcessingCorrection = ref(false);

const handleEditWeight = (submission: any) => {
  selectedSubmission.value = submission;
  showWeightCorrection.value = true;
};

const handleWeightConfirm = async (newWeight: number) => {
  if (!selectedSubmission.value) return;
  isProcessingCorrection.value = true;
  
  try {
    await supabase
      .from('submission_reviews')
      .update({ 
        api_weight: newWeight,
        confirmed_weight: newWeight,
        status: 'VERIFIED'
      })
      .eq('id', selectedSubmission.value.id);
    
    showWeightCorrection.value = false;
    selectedSubmission.value = null;
    fetchReviews();
    fetchCollectorStats();
  } catch (err) {
    console.error('Error updating weight:', err);
  } finally {
    isProcessingCorrection.value = false;
  }
};

const handleWeightReject = async (reason: string) => {
  if (!selectedSubmission.value) return;
  isProcessingCorrection.value = true;
  
  try {
    await supabase
      .from('submission_reviews')
      .update({ 
        status: 'REJECTED',
        admin_note: reason
      })
      .eq('id', selectedSubmission.value.id);
    
    showWeightCorrection.value = false;
    selectedSubmission.value = null;
    fetchReviews();
    fetchCollectorStats();
  } catch (err) {
    console.error('Error rejecting submission:', err);
  } finally {
    isProcessingCorrection.value = false;
  }
};

// Quick verify/reject from dashboard
const quickVerify = async (id: string) => {
  await supabase
    .from('submission_reviews')
    .update({ status: 'VERIFIED' })
    .eq('id', id);
  fetchReviews();
  fetchCollectorStats();
};

const quickReject = async (id: string) => {
  await supabase
    .from('submission_reviews')
    .update({ status: 'REJECTED', admin_note: 'Rejected from dashboard' })
    .eq('id', id);
  fetchReviews();
  fetchCollectorStats();
};

// Cleaning verification checklist modal
const showCleaningChecklist = ref(false);
const cleaningChecklist = ref({
  binEmpty: false,
  areaClean: false,
  printerWorking: false
});

const openCleaningChecklist = () => {
  cleaningChecklist.value = { binEmpty: false, areaClean: false, printerWorking: false };
  showCleaningChecklist.value = true;
};

const submitCleaningChecklist = async () => {
  if (!cleaningChecklist.value.binEmpty || !cleaningChecklist.value.areaClean) {
    alert('Please confirm bin is empty and area is clean before submitting.');
    return;
  }
  
  // In a real app, this would create a cleaning record
  showCleaningChecklist.value = false;
  alert('Cleaning checklist recorded! Please proceed to log the cleaning in the Cleaning Records section.');
};

onMounted(() => {
  machineStore.fetchMachines();
  fetchStats();
  fetchCollectorStats();
  fetchReviews();
  fetchCleaningLogs();
  
  // Watch for machines to load, then fetch cleaned timestamps
  watch(machines, (newMachines) => {
    if (newMachines.length > 0) {
      fetchLastCleanedTimestamps();
    }
  }, { immediate: true });
  
  // Auto-refresh submission data every 30 seconds
  const submissionRefreshInterval = setInterval(() => {
    fetchReviews();
  }, 30000);
  
  watch(() => auth.loading, (isLoading) => {
    if (!isLoading) {
      machineStore.fetchMachines();
      fetchStats();
      fetchCollectorStats();
      fetchReviews();
    }
  });
  
  watch(() => auth.role, (newRole) => {
    if (newRole) {
      machineStore.fetchMachines();
      fetchStats();
      fetchCollectorStats();
      fetchReviews();
    }
  });
});
</script>

<template>
  <div class="space-y-8 p-6">
    <!-- Weight Correction Modal -->
    <SubmissionCorrectionModal
      :is-open="showWeightCorrection"
      :review="selectedSubmission"
      :is-processing="isProcessingCorrection"
      @close="showWeightCorrection = false"
      @confirm="handleWeightConfirm"
      @reject="handleWeightReject"
    />

    <!-- Cleaning Checklist Modal -->
    <div v-if="showCleaningChecklist" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div class="p-6">
          <h3 class="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <CheckSquare :size="24" class="text-green-600" />
            Cleaning Verification
          </h3>
          
          <div class="space-y-4">
            <label class="flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors"
              :class="cleaningChecklist.binEmpty ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'">
              <input type="checkbox" v-model="cleaningChecklist.binEmpty" class="sr-only" />
              <div class="h-6 w-6 rounded border-2 flex items-center justify-center transition-colors"
                :class="cleaningChecklist.binEmpty ? 'bg-green-500 border-green-500' : 'border-gray-300'">
                <CheckCircle2 v-if="cleaningChecklist.binEmpty" :size="16" class="text-white" />
              </div>
              <div>
                <p class="font-bold text-gray-900">Is the bin empty?</p>
                <p class="text-sm text-gray-500">Confirm the collection bin has been emptied</p>
              </div>
            </label>
            
            <label class="flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors"
              :class="cleaningChecklist.areaClean ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'">
              <input type="checkbox" v-model="cleaningChecklist.areaClean" class="sr-only" />
              <div class="h-6 w-6 rounded border-2 flex items-center justify-center transition-colors"
                :class="cleaningChecklist.areaClean ? 'bg-green-500 border-green-500' : 'border-gray-300'">
                <CheckCircle2 v-if="cleaningChecklist.areaClean" :size="16" class="text-white" />
              </div>
              <div>
                <p class="font-bold text-gray-900">Is the area clean?</p>
                <p class="text-sm text-gray-500">Sweep up any debris or spillage</p>
              </div>
            </label>
            
            <label class="flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors"
              :class="cleaningChecklist.printerWorking ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'">
              <input type="checkbox" v-model="cleaningChecklist.printerWorking" class="sr-only" />
              <div class="h-6 w-6 rounded border-2 flex items-center justify-center transition-colors"
                :class="cleaningChecklist.printerWorking ? 'bg-green-500 border-green-500' : 'border-gray-300'">
                <CheckCircle2 v-if="cleaningChecklist.printerWorking" :size="16" class="text-white" />
              </div>
              <div>
                <p class="font-bold text-gray-900">Is the printer working?</p>
                <p class="text-sm text-gray-500">Test print a receipt if applicable</p>
              </div>
            </label>
          </div>
          
          <div class="mt-6 flex gap-3">
            <button 
              @click="showCleaningChecklist = false"
              class="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button 
              @click="submitCleaningChecklist"
              class="flex-1 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-bold"
            >
              Submit Checklist
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Truck class="text-green-600" :size="28" />
          Collector Dashboard
        </h2>
        <p class="text-sm text-gray-500">Overview of collection routes and recycling activity</p>
      </div>
      <div class="flex gap-3">
        <button 
          @click="handleHarvest(false)" 
          :disabled="isHarvesting" 
          class="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-all"
        >
          <RefreshCw :size="18" :class="{'animate-spin': isHarvesting, 'mr-2': true}" />
          {{ isHarvesting ? 'Syncing...' : 'Fetch & Verify' }}
        </button>

        <button 
          @click="handleHarvest(true)" 
          :disabled="isHarvesting" 
          class="flex items-center gap-2 border border-amber-200 text-amber-700 bg-amber-50 px-4 py-2 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-all"
          title="Force check all users ignoring 2 min timer"
        >
          <RefreshCw :size="18" :class="{'animate-spin': isHarvesting, 'mr-2': true}" />
          Force Sync
        </button>

        <button 
          @click="handleRefresh"
          class="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition shadow-sm text-sm font-bold"
        >
          <Activity :size="16" :class="{'animate-spin': isRefreshing}" />
          Refresh Data
        </button>
      </div>
    </div>
    
    <div v-if="statsLoading && machines.length === 0" class="flex h-64 items-center justify-center">
      <div class="text-gray-400 animate-pulse font-medium">Loading Collector Dashboard...</div>
    </div>

    <div v-else>
      <!-- Primary Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard title="Pending Verifications" :value="collectorStats.pendingVerifications" color="amber" description="Need Review">
          <template #icon><AlertCircle :size="24" /></template>
        </StatsCard>
        <StatsCard title="Priority Machines" :value="collectorStats.highPriorityMachines" color="amber" description="Need Attention">
          <template #icon><MapPin :size="24" /></template>
        </StatsCard>
        <StatsCard title="Online Machines" :value="machineLoading ? '...' : onlineMachinesCount" color="green" description="Active Units">
          <template #icon><Server :size="24" /></template>
        </StatsCard>
        <StatsCard title="Total Collected" :value="`${formatNumber(totalWeight)} kg`" color="purple" description="Environmental Impact">
          <template #icon><Scale :size="24" /></template>
        </StatsCard>
      </div>

      <!-- Daily Scorecard - Today's Progress -->
      <div class="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-6 mb-8">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-bold text-white flex items-center gap-2">
            <Calendar :size="20" />
            Daily Scorecard - Today's Progress
          </h3>
          <span class="text-sm text-gray-400">{{ new Date().toLocaleDateString('en-MY', { weekday: 'long', month: 'long', day: 'numeric' }) }}</span>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <!-- Today's Submissions -->
          <div class="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/10">
            <div class="flex items-center gap-2 mb-2">
              <Recycle :size="18" class="text-green-400" />
              <span class="text-xs font-bold text-gray-300 uppercase">Submissions</span>
            </div>
            <p class="text-3xl font-bold text-white">{{ collectorStats.todaySubmissions }}</p>
            <p class="text-xs text-gray-400 mt-1">collections today</p>
          </div>
          
          <!-- Today's Weight -->
          <div class="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/10">
            <div class="flex items-center gap-2 mb-2">
              <Scale :size="18" class="text-emerald-400" />
              <span class="text-xs font-bold text-gray-300 uppercase">Weight Moved</span>
            </div>
            <p class="text-3xl font-bold text-white">{{ formatNumber(collectorStats.todayWeight) }} <span class="text-lg font-normal">kg</span></p>
            <p class="text-xs text-gray-400 mt-1">physically moved today</p>
          </div>
          
          <!-- Verified -->
          <div class="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/10">
            <div class="flex items-center gap-2 mb-2">
              <CheckCircle2 :size="18" class="text-blue-400" />
              <span class="text-xs font-bold text-gray-300 uppercase">Approved</span>
            </div>
            <p class="text-3xl font-bold text-white">{{ collectorStats.verifiedCount }}</p>
            <p class="text-xs text-gray-400 mt-1">verified submissions</p>
          </div>
          
          <!-- Rejected -->
          <div class="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/10"
            :class="collectorStats.rejectedCount > 5 ? 'ring-2 ring-red-400' : ''">
            <div class="flex items-center gap-2 mb-2">
              <XCircle :size="18" class="text-red-400" />
              <span class="text-xs font-bold text-gray-300 uppercase">Rejected</span>
            </div>
            <p class="text-3xl font-bold text-white">{{ collectorStats.rejectedCount }}</p>
            <p class="text-xs text-gray-400 mt-1">contamination/issues</p>
            <div v-if="collectorStats.rejectedCount > 5" class="mt-2 text-xs text-red-300 font-medium">
              ⚠️ High rejection rate - check locations
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <!-- Live Verification Queue -->
        <div class="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Camera :size="20" class="text-amber-600"/> Verification Queue
            </h3>
            <span class="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-bold">
              {{ pendingVerifications.length }} pending
            </span>
          </div>
          
          <div class="flex-1 space-y-3 max-h-[400px] overflow-y-auto">
            <div v-for="sub in pendingVerifications" :key="sub.id" 
              class="p-3 rounded-xl border border-gray-100 hover:border-amber-200 hover:bg-amber-50/50 transition-all">
              <div class="flex items-start justify-between mb-2">
                <div>
                  <p class="text-sm font-bold text-gray-900">{{ sub.users?.nickname || 'Guest' }}</p>
                  <p class="text-xs text-gray-500">{{ sub.device_no }} • {{ sub.waste_type }}</p>
                </div>
                <div class="text-right">
                  <p class="text-lg font-bold text-emerald-600">{{ sub.api_weight }}kg</p>
                  <p class="text-xs text-gray-400">{{ new Date(sub.submitted_at).toLocaleTimeString() }}</p>
                </div>
              </div>
              
              <!-- Evidence Photo -->
              <div v-if="sub.photo_url" class="mb-3">
                <img :src="sub.photo_url" class="h-20 w-full object-cover rounded-lg" alt="Evidence" />
              </div>
              
              <!-- Quick Actions -->
              <div class="flex gap-2">
                <button 
                  @click="quickVerify(sub.id)"
                  class="flex-1 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg hover:bg-green-600 flex items-center justify-center gap-1"
                >
                  <CheckCircle2 :size="14" /> Approve
                </button>
                <button 
                  @click="quickReject(sub.id)"
                  class="flex-1 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 flex items-center justify-center gap-1"
                >
                  <XCircle :size="14" /> Reject
                </button>
                <button 
                  @click="handleEditWeight(sub)"
                  class="py-1.5 px-3 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50"
                  title="Edit weight"
                >
                  <Edit3 :size="14" />
                </button>
              </div>
            </div>
            
            <div v-if="pendingVerifications.length === 0" class="text-center py-8 text-gray-400">
              <CheckCircle2 :size="32" class="mx-auto mb-2 opacity-50" />
              <p class="text-sm">All caught up! No pending verifications.</p>
            </div>
          </div>
        </div>

        <!-- Actionable Machine Status (To-Do List) -->
        <div class="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Server :size="20" class="text-blue-600"/> Machine Status (To-Do List)
            </h3>
            <div class="flex items-center gap-2">
              <select v-model="sortBy" class="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50">
                <option value="urgency">Sort by Urgency</option>
                <option value="name">Sort by Name</option>
              </select>
            </div>
          </div>
          
          <!-- Priority Alert -->
          <div v-if="priorityMachines.length > 0" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <div class="flex items-center gap-2 text-red-700">
              <AlertCircle :size="16" />
              <span class="text-sm font-bold">{{ priorityMachines.length }} machines need immediate attention</span>
            </div>
          </div>
          
          <div class="flex-1 space-y-3 max-h-[400px] overflow-y-auto">
            <div v-for="machine in sortedMachines.slice(0, 10)" :key="machine.id" 
              class="p-4 rounded-xl border transition-all"
              :class="machine.needsCollection ? 'border-red-200 bg-red-50/50' : machine.needsCleaning ? 'border-amber-200 bg-amber-50/50' : 'border-gray-100 hover:border-gray-200'"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-start gap-3">
                  <div class="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    :class="machine.isOnline ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'">
                    <Server :size="18" />
                  </div>
                  <div>
                    <p class="text-sm font-bold text-gray-900">{{ machine.name }}</p>
                    <p class="text-xs text-gray-500">{{ machine.location_name || machine.address || machine.deviceNo }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <!-- Maintenance Icons -->
                  <span v-if="machine.needsCollection" class="p-1.5 bg-red-100 text-red-600 rounded-lg" title="Needs Collection">
                    <Trash2 :size="14" />
                  </span>
                  <span v-if="machine.needsCleaning" class="p-1.5 bg-amber-100 text-amber-600 rounded-lg" title="Needs Cleaning">
                    <Sparkles :size="14" />
                  </span>
                  <span class="text-[10px] px-2 py-1 rounded-full font-bold uppercase" 
                    :class="machine.isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                    {{ machine.isOnline ? 'Online' : 'Offline' }}
                  </span>
                </div>
              </div>
              
              <!-- Fill Level Indicators -->
              <div class="space-y-2">
                <div v-for="(comp, idx) in machine.compartments" :key="idx" class="flex items-center gap-2">
                  <span class="text-xs text-gray-500 w-16 truncate">{{ comp.label }}</span>
                  <div class="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      class="h-full rounded-full transition-all"
                      :class="getFillColor(comp.percent)"
                      :style="{ width: `${comp.percent}%` }"
                    ></div>
                  </div>
                  <span class="text-xs font-bold w-10 text-right" 
                    :class="comp.percent >= 90 ? 'text-red-600' : comp.percent >= 70 ? 'text-amber-600' : 'text-gray-600'">
                    {{ comp.percent }}%
                  </span>
                </div>
              </div>
              
              <!-- Last Cleaned -->
              <div class="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                <div class="flex items-center gap-1 text-gray-500">
                  <Clock :size="12" />
                  <span>Last cleaned: {{ formatLastCleaned(machine.lastCleaned) }}</span>
                </div>
                <a v-if="machine.googleMapsUrl && machine.googleMapsUrl !== '#'" 
                  :href="machine.googleMapsUrl" 
                  target="_blank"
                  class="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Navigation :size="12" /> Route
                </a>
              </div>
            </div>
            
            <div v-if="machines.length === 0" class="text-center py-6 text-gray-400 text-sm">No machines found</div>
          </div>
        </div>
      </div>

      <!-- Collection Summary -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div class="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <Recycle :size="18" class="text-green-600" />
            <span class="text-sm font-bold text-gray-700">Total Weight Collected</span>
          </div>
          <p class="text-3xl font-bold text-gray-900">{{ formatNumber(totalWeight) }} <span class="text-lg font-normal text-gray-500">kg</span></p>
          <p class="text-xs text-gray-400 mt-1">Lifetime recycling impact</p>
        </div>
        <div class="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <Users :size="18" class="text-blue-600" />
            <span class="text-sm font-bold text-gray-700">Cleaning Records</span>
          </div>
          <p class="text-3xl font-bold text-gray-900">{{ collectorStats.cleaningRecordsCount }}</p>
          <p class="text-xs text-gray-400 mt-1">Total collection logs</p>
        </div>
        <div class="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <Wrench :size="18" class="text-purple-600" />
            <span class="text-sm font-bold text-gray-700">Maintenance Check</span>
          </div>
          <button 
            @click="openCleaningChecklist"
            class="mt-2 w-full py-2 bg-purple-50 text-purple-700 text-sm font-bold rounded-lg hover:bg-purple-100 transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles :size="16" />
            Verify Machine Health
          </button>
          <p class="text-xs text-gray-400 mt-1">Run pre-collection checklist</p>
        </div>
      </div>

      <!-- Cleaning/Collection Logs -->
      <div class="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CheckCircle2 :size="20" class="text-purple-600"/> Recent Collection Logs
          </h3>
          <router-link to="/cleaning-logs" class="text-xs font-medium text-blue-600 hover:underline">View All</router-link>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="c in recentCleaning.slice(0, 6)" :key="c.id" class="flex items-center gap-3 p-4 rounded-xl hover:bg-gray-50 transition-colors border border-gray-100">
            <div class="h-10 w-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <CheckCircle2 :size="18" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-gray-900 truncate">{{ c.machines?.device_name || c.device_no || 'Unknown Machine' }}</p>
              <p class="text-xs text-gray-500">{{ new Date(c.created_at).toLocaleDateString() }}</p>
            </div>
            <span class="text-[10px] px-2 py-1 rounded-full font-bold uppercase" :class="getStatusColor(c.status)">
              {{ c.status }}
            </span>
          </div>
          <div v-if="recentCleaning.length === 0" class="col-span-full text-center py-6 text-gray-400 text-sm">No collection logs found</div>
        </div>
      </div>

      <!-- System Status -->
      <div class="mt-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <Truck class="text-green-600" :size="20" />
          <h3 class="text-sm font-bold text-gray-900">Collection System</h3>
          <span class="px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full border border-green-100 flex items-center gap-2">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Ready for Collections
          </span>
        </div>
        <div class="text-xs text-gray-400">Last synced: {{ new Date().toLocaleTimeString() }}</div>
      </div>
    </div>
  </div>
</template>
