import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { getMachineConfig } from '../services/autogcm';
import { useAuthStore } from './auth';
import { useViewerAssignments } from '../composables/useViewerAssignments';

export interface DashboardMachine {
  id: number;
  deviceNo: string;
  name: string;
  address: string;
  zone: string;
  maintenanceContact: string;
  googleMapsUrl: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  isOnline: boolean;
  isManualOffline: boolean;
  statusText: string;
  statusCode: number;
  temperature?: number;
  lastPing?: string;
  hasJam?: boolean;
  hasDoorOpen?: boolean;
  hasError?: boolean;
  compartments: any[];
}

export const useMachineStore = defineStore('machines', () => {
  // State
  const machines = ref<DashboardMachine[]>([]);
  const loading = ref(false);
  const lastUpdated = ref<number>(0);
  
  // 🔥 NEW: Track who owns the current data
  const lastFetchedMerchantId = ref<string | null>(null);
  
  // 🔥 NEW: Viewer assignments state
  const viewerAssignments = ref<{ machine_id: number; machines?: any }[]>([]);
  const viewerHasAssignments = ref(false);
  
  // Create viewer assignments composable instance
  const viewerAssignmentsComposable = useViewerAssignments();
  
  const CACHE_DURATION = 5 * 60 * 1000;

  // Helpers
  const mapTypeToLabel = (apiName: string) => {
    if (!apiName) return { label: "General", color: "bg-gray-100 text-gray-600" };
    const lower = apiName.toLowerCase();
    
    if (lower.includes("oil") || lower.includes("minyak") || lower.includes("uco")) {
        return { label: "UCO (Oil)", color: "bg-orange-100 text-orange-800 border-orange-200" };
    }
    if (lower.includes("paper") || lower.includes("kertas")) {
        return { label: "Paper", color: "bg-blue-100 text-blue-800 border-blue-200" };
    }
    if (lower.includes("plastic") || lower.includes("botol") || lower.includes("plastik")) {
        return { label: "Plastic/Alu", color: "bg-green-100 text-green-800 border-green-200" };
    }
    return { label: apiName, color: "bg-gray-100 text-gray-600 border-gray-200" };
  };

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // --- ACTION: Fetch Machines ---
  const fetchMachines = async (forceRefresh = false) => {
    const auth = useAuthStore();
    const { fetchMyAssignments, getAssignedMachineIds, assignments } = viewerAssignmentsComposable;
    
    // Wait for auth to be loaded if still loading or role not set
    if (auth.loading || !auth.role) {
        console.log("MachineStore: Waiting for auth/role to be ready... loading:", auth.loading, "role:", auth.role);
        return;
    }
    
    // 1. IDENTIFY ROLE
    const isPlatformOwner = auth.role === 'SUPER_ADMIN' && !auth.merchantId;
    const isViewer = auth.role === 'VIEWER';
    const isCollector = auth.role === 'COLLECTOR';
    const isAgent = auth.role === 'AGENT';
    
    // Get current agent's admin ID for assigned_agent_id filtering
    let currentAgentAdminId: string | null = null;
    if (isAgent && auth.user?.email) {
        const { data: agentData } = await supabase
            .from('app_admins')
            .select('id')
            .eq('email', auth.user.email)
            .single();
        currentAgentAdminId = agentData?.id || null;
        console.log("MachineStore: AGENT ID for filtering:", currentAgentAdminId);
    }
    
    console.log("MachineStore: Fetching with role:", auth.role, "isPlatformOwner:", isPlatformOwner, "isViewer:", isViewer, "merchantId:", auth.merchantId);
    
    // 🔥 NEW: For VIEWERs, fetch their assigned machines first
    let viewerAssignedMachineIds: number[] | null = null;
    if (isViewer) {
        await fetchMyAssignments();
        viewerAssignedMachineIds = getAssignedMachineIds();
        viewerAssignments.value = assignments.value;
        viewerHasAssignments.value = viewerAssignedMachineIds.length > 0;
        console.log("MachineStore: Viewer assigned machine IDs:", viewerAssignedMachineIds);
    } else {
        viewerAssignments.value = [];
        viewerHasAssignments.value = false;
    }
    
    // 2. SECURITY WIPE
    // If not logged in at all, or if strictly a merchant without an ID, clear data.
    // VIEWER, AGENT, and COLLECTOR roles can see assigned/merchant data - check this first
    if (isViewer || isCollector || isAgent) {
        // VIEWER, AGENT, and COLLECTOR can access - but filtered by assignments or merchant
        // If AGENT has no assignments, they'll see nothing
    } else if (!auth.merchantId && !isPlatformOwner) {
      console.warn("MachineStore: No Access Context. Clearing data.");
      machines.value = [];
      lastFetchedMerchantId.value = null;
      return;
    }

    // 3. CONTEXT CHECK
    // If we switch from "Global" to "Specific Merchant" or vice versa
    const currentContextId = auth.merchantId || 'GLOBAL';
    if (lastFetchedMerchantId.value !== currentContextId) {
      machines.value = [];
      forceRefresh = true;
    }

    // 4. CACHE CHECK
    const now = Date.now();
    if (!forceRefresh && machines.value.length > 0 && (now - lastUpdated.value < CACHE_DURATION)) {
      return; 
    }

    loading.value = true;
    const tempMachines: DashboardMachine[] = [];

    try {
      // 5. QUERY BUILDER
      // Start with base query
      let query = supabase
        .from('machines')
        .select('*'); // We fetch config_bin_1/2 directly from machines now

      // 🔥 CRITICAL FIX: Only apply merchant filter if NOT Platform Owner and NOT Viewer/Collector/Agent
      // VIEWER and AGENT see only their assigned machines (if any), or all if none assigned
      // COLLECTOR sees machines based on their merchant_id
      if (isViewer) {
          // If viewer has specific machine assignments, filter by those
          if (viewerAssignedMachineIds && viewerAssignedMachineIds.length > 0) {
              query = query.in('id', viewerAssignedMachineIds);
              console.log("MachineStore: VIEWER filtered to assigned machines:", viewerAssignedMachineIds.length);
          } else if (auth.merchantId) {
              // Fall back to merchant filter if no specific assignments
              query = query.eq('merchant_id', auth.merchantId);
              console.log("MachineStore: VIEWER using merchant filter:", auth.merchantId);
          }
          // If no assignments AND no merchant, viewer sees nothing (handled by security wipe)
      } else if (isAgent) {
          // AGENT sees only machines where assigned_agent_id matches their ID
          if (currentAgentAdminId) {
              query = query.eq('assigned_agent_id', currentAgentAdminId);
              console.log("MachineStore: AGENT filtered by assigned_agent_id:", currentAgentAdminId);
          } else {
              // Agent has no admin ID - show nothing (security)
              console.log("MachineStore: AGENT has no admin ID - showing nothing");
              machines.value = [];
              loading.value = false;
              return;
          }
      } else if ((isCollector) && auth.merchantId) {
          // COLLECTOR uses merchant filter to see all machines for their merchant
          query = query.eq('merchant_id', auth.merchantId);
          console.log("MachineStore: COLLECTOR using merchant filter:", auth.merchantId);
      } else if (!isPlatformOwner && auth.merchantId) {
         query = query.eq('merchant_id', auth.merchantId);
      }

      // Execute Query
      const { data: dbMachines, error } = await query
        .eq('is_active', true)
        .order('zone', { ascending: true });

      if (error) throw error;

      // 6. UPDATE TRACKER
      lastFetchedMerchantId.value = currentContextId;

      if (!dbMachines) {
         machines.value = [];
         return;
      }

      // --- LOOP LOGIC ---
      for (const dbMachine of dbMachines) {
        let apiRes = null;
        let isOnline = false;
        let statusCode = 0; 
        let statusText = "Offline";
        
        try {
             apiRes = await getMachineConfig(dbMachine.device_no);
             if (apiRes && apiRes.code === 200) isOnline = true;
        } catch (e) { /* Ignore */ }

        const apiConfigs = apiRes?.data || [];
        const rawWeight1 = Number(dbMachine.current_bag_weight || 0);
        const rawWeight2 = Number(dbMachine.current_weight_2 || 0);
        
        // Bin 1
        const bin1Config = apiConfigs.find((c: any) => c.positionNo === 1) || {};
        const weight1 = bin1Config.weight ? Number(bin1Config.weight) : rawWeight1;
        const isFull1 = bin1Config.isFull === true || bin1Config.isFull === "true"; 
        
        let percent1 = bin1Config.rate ? Math.round(Number(bin1Config.rate)) : 0;
        if (isFull1) percent1 = 100;
        else if (percent1 === 0 && weight1 > 0) {
             const label1 = mapTypeToLabel(bin1Config.rubbishTypeName || dbMachine.config_bin_1 || "Bin 1").label;
             const capacity = (label1.includes("Oil") || label1.includes("UCO")) ? 400 : 25;
             percent1 = Math.round((weight1 / capacity) * 100);
             if (percent1 > 100) percent1 = 100;
        }

        const bin1 = {
            label: mapTypeToLabel(bin1Config.rubbishTypeName || dbMachine.config_bin_1 || "Bin 1").label,
            color: mapTypeToLabel(bin1Config.rubbishTypeName || dbMachine.config_bin_1 || "Bin 1").color,
            weight: weight1.toFixed(2),
            percent: percent1,
            isFull: isFull1 
        };

        // Bin 2
        const bin2Config = apiConfigs.find((c: any) => c.positionNo === 2) || {};
        const weight2 = bin2Config.weight ? Number(bin2Config.weight) : rawWeight2;
        const isFull2 = bin2Config.isFull === true || bin2Config.isFull === "true";

        let percent2 = bin2Config.rate ? Math.round(Number(bin2Config.rate)) : 0;
        if (isFull2) percent2 = 100;
        else if (percent2 === 0 && weight2 > 0) {
             percent2 = Math.round((weight2 / 50) * 100); 
             if (percent2 > 100) percent2 = 100;
        }

        const bin2 = {
            label: mapTypeToLabel(bin2Config.rubbishTypeName || dbMachine.config_bin_2 || "Bin 2").label,
            color: mapTypeToLabel(bin2Config.rubbishTypeName || dbMachine.config_bin_2 || "Bin 2").color,
            weight: weight2.toFixed(2),
            percent: percent2,
            isFull: isFull2
        };

        const compartments = [bin1];
        if (!dbMachine.name.toLowerCase().includes('uco')) {
            compartments.push(bin2);
        }

        // Status
        const isManualOffline = dbMachine.is_manual_offline === true; // Must exist in DB
        
        const hasFault = apiConfigs.some((c: any) => c.status === 2 || c.status === 3);
        const hasActivity = apiConfigs.some((c: any) => c.status === 1);
        const anyBinFull = compartments.some(c => c.isFull);

        // Priority Logic
        if (isManualOffline) {
            statusCode = 3; // Use maintenance color (Yellow) or Offline (Grey)
            statusText = "Maintenance (Manual)";
            isOnline = false; // Force offline for UI logic
        }
        else if (!isOnline) { statusCode = 0; statusText = "Offline"; }
        else if (anyBinFull) { statusCode = 4; statusText = "Bin Full"; } 
        else if (hasFault) { statusCode = 3; statusText = "Maintenance"; }
        else if (hasActivity) { statusCode = 1; statusText = "In Use"; }
        else { statusCode = 0; statusText = "Online"; }

        // Sync
        if (isOnline) {
             const w1 = Number(bin1.weight);
             const w2 = Number(bin2.weight);
             if (Math.abs(w1 - rawWeight1) > 0.05 || Math.abs(w2 - rawWeight2) > 0.05) {
                 await supabase.from('machines').update({ 
                     current_bag_weight: w1, 
                     current_weight_2: w2 
                 }).eq('id', dbMachine.id);
             }
        }

        let mapsUrl = "#";
        if (dbMachine.latitude && dbMachine.longitude) {
           mapsUrl = `http://googleusercontent.com/maps.google.com/?q=${dbMachine.latitude},${dbMachine.longitude}`;
        }

// Calculate days until full for each compartment
    const compartmentsWithDays = compartments.map((comp: any) => {
      const weight = parseFloat(comp.weight) || 0;
      const daysUntilFull = calculateDaysUntilFullSync(weight);
      return {
        ...comp,
        estimatedFullDays: daysUntilFull
      };
    });
    
    // Get additional machine vitals from API/config
    const apiMachine = apiConfigs.find((c: any) => c.deviceNo === dbMachine.device_no) || {};
    const temperature = apiMachine.temperature || dbMachine.temperature || null;
    const lastPing = apiMachine.lastPing || dbMachine.last_online || null;
    const hasJam = apiMachine.status === 2 || apiMachine.jam === true || apiMachine.jam === 'true';
    const hasDoorOpen = apiMachine.doorOpen === true || apiMachine.doorOpen === 'true' || apiMachine.status === 3;
    const hasError = hasJam || hasDoorOpen;
    
    tempMachines.push({
            id: dbMachine.id,
            deviceNo: dbMachine.device_no,
            name: dbMachine.name,
            address: dbMachine.address,
            zone: dbMachine.zone || 'General',
            maintenanceContact: dbMachine.maintenance_contact || 'Unassigned',
            googleMapsUrl: mapsUrl,
            latitude: dbMachine.latitude,
            longitude: dbMachine.longitude,
            lat: dbMachine.latitude,
            lng: dbMachine.longitude,
            isOnline,
            isManualOffline,
            statusCode,
            statusText,
            temperature,
            lastPing,
            hasJam,
            hasDoorOpen,
            hasError,
            compartments: compartmentsWithDays
          });
        
        await sleep(100); 
      }

      machines.value = tempMachines;
      lastUpdated.value = Date.now();

    } catch (err) {
      console.error("Store Error:", err);
    } finally {
      loading.value = false;
    }
  };

  // Reset function for manual use
  const reset = () => {
      machines.value = [];
      lastFetchedMerchantId.value = null;
      lastUpdated.value = 0;
  };

  // New Action: Toggle Offline Mode
  const toggleOfflineMode = async (machineId: number, currentStatus: boolean) => {
      const newStatus = !currentStatus;
      
      // 1. Optimistic Update (Immediate UI feedback)
      const target = machines.value.find(m => m.id === machineId);
      if (target) target.isManualOffline = newStatus;

      // 2. DB Update
      const { error } = await supabase
          .from('machines')
          .update({ is_manual_offline: newStatus })
          .eq('id', machineId);

      if (error) {
          console.error("Toggle Failed:", error);
          if (target) target.isManualOffline = currentStatus; // Revert
          return;
      }
      
      // 3. Refresh to update colors/text correctly
      await fetchMachines(true);
  };

  return { 
    machines, 
    loading, 
    fetchMachines, 
    lastUpdated, 
    reset, 
    lastFetchedMerchantId, 
    toggleOfflineMode,
    viewerAssignments,
    viewerHasAssignments,
    calculateDaysUntilFull
  };
});

// Sync version for immediate calculation (estimates based on typical rate)
function calculateDaysUntilFullSync(currentWeight: number, totalCapacity: number = 50): number | null {
  const binCapacity = totalCapacity || 50;
  const remainingCapacity = binCapacity - currentWeight;
  
  if (remainingCapacity <= 0) return 0;
  if (remainingCapacity >= binCapacity) return null;
  
  // Typical daily rate ~5kg/day for estimation
  const typicalDailyRate = 5;
  return Math.round(remainingCapacity / typicalDailyRate);
}

// Days Until Full Calculation Utility (async with actual data)
async function calculateDaysUntilFull(machineId: number, currentWeight: number, totalCapacity: number = 50): Promise<number | null> {
  try {
    // Default bin capacity is 50kg per bin
    const binCapacity = totalCapacity || 50;
    
    // Calculate remaining capacity
    const remainingCapacity = binCapacity - currentWeight;
    
    if (remainingCapacity <= 0) return 0; // Already full
    if (remainingCapacity >= binCapacity) return null; // Empty, can't calculate
    
    // Get last 7 days of weight data for this machine
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: submissions, error } = await supabase
      .from('submission_reviews')
      .select('api_weight, submitted_at')
      .eq('device_no', machineId)
      .gte('submitted_at', sevenDaysAgo.toISOString())
      .eq('status', 'VERIFIED')
      .order('submitted_at', { ascending: true });
    
    if (error || !submissions || submissions.length === 0) {
      // No data in last 7 days - estimate based on typical rate
      return Math.round(remainingCapacity / 5); // Assume ~5kg/day average
    }
    
    // Group weight by date
    const dailyWeights: Record<string, number> = {};
    for (const sub of submissions) {
      const date = new Date(sub.submitted_at).toISOString().split('T')[0];
      if (!date) continue;
      dailyWeights[date] = (dailyWeights[date] ?? 0) + (sub.api_weight ?? 0);
    }
    
    // Calculate average daily rate
    const daysWithData = Object.keys(dailyWeights).length;
    const totalWeight = Object.values(dailyWeights).reduce((sum, w) => sum + w, 0);
    const averageDailyRate = totalWeight / daysWithData;
    
    if (averageDailyRate <= 0) {
      return Math.round(remainingCapacity / 5); // Fallback to typical rate
    }
    
    // Calculate days until full
    const daysUntilFull = Math.round(remainingCapacity / averageDailyRate);
    
    return daysUntilFull;
  } catch (err) {
    console.error('Days Until Full calculation error:', err);
    return null;
  }
}