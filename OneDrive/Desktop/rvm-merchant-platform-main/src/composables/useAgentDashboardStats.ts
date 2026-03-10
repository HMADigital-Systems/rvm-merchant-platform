import { ref, onUnmounted } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import { useViewerAssignments } from '../composables/useViewerAssignments';
import { getMachineConfig } from '../services/autogcm';

// Types for Agent Dashboard
export interface AgentAlert {
  id: string;
  machine_id: number;
  machine_name: string;
  device_no: string;
  alert_type: 'BIN_FULL' | 'PRINTER_JAM' | 'NETWORK_DISCONNECTED' | 'MAINTENANCE' | 'OFFLINE';
  message: string;
  severity: 'critical' | 'warning' | 'info';
  created_at: string;
}

export interface VerificationItem {
  id: string;
  vendor_record_id: string;
  user_id: string;
  phone: string;
  device_no: string;
  waste_type: string;
  photo_url: string;
  api_weight: number;
  calculated_value: number;
  submitted_at: string;
  users?: {
    nickname: string;
    avatar_url: string;
    phone: string | null;
  };
}

export interface AgentMachine {
  id: number;
  device_no: string;
  name: string;
  address: string;
  zone: string;
  isOnline: boolean;
  lastHeartbeat: string;
  is_manual_offline: boolean;
  statusText?: string;
  statusCode?: number;
  compartments: {
    label: string;
    color: string;
    weight: string;
    percent: number;
    isFull: boolean;
  }[];
}

export interface CollectionStats {
  total_collected_today: number;
  daily_target: number;
  daily_average: number;
  pet_bottles: number;
  aluminum_cans: number;
  plastic_weight: number;
  aluminum_weight: number;
  incentives_issued: number;
  active_alerts_count: number;
  near_capacity_count: number;
  online_units_count: number;
}

export interface AgentLog {
  id: string;
  machine_id: number;
  machine_name: string;
  device_no: string;
  log_type: 'MAINTENANCE' | 'COLLECTION' | 'VERIFICATION' | 'ISSUE_REPORTED';
  description: string;
  performed_by: string;
  created_at: string;
}

// Extended machine type for live data
interface MachineWithLiveData {
  id: number;
  device_no: string;
  name: string;
  address?: string;
  zone?: string;
  is_active: boolean;
  is_manual_offline: boolean;
  current_bag_weight: number;
  current_weight_2: number;
  last_heartbeat: string;
  config_bin_1: string;
  config_bin_2: string;
  _liveWeight1?: number;
  _liveWeight2?: number;
  _livePercent1?: number;
  _livePercent2?: number;
  _liveIsFull1?: boolean;
  _liveIsFull2?: boolean;
  _statusCode?: number;
  _statusText?: string;
  _isOnline?: boolean;
}

export function useAgentDashboardStats() {
  const loading = ref(true);
  const loadingLive = ref(false);
  const lastUpdated = ref<Date | null>(null);
  
  // Auto-refresh interval
  let refreshInterval: ReturnType<typeof setInterval> | null = null;
  const REFRESH_INTERVAL_MS = 30000; // 30 seconds for live data
  
  // Data buckets
  const alerts = ref<AgentAlert[]>([]);
  const verificationQueue = ref<VerificationItem[]>([]);
  const agentMachines = ref<AgentMachine[]>([]);
  const collectionStats = ref<CollectionStats>({
    total_collected_today: 0,
    daily_target: 0,
    daily_average: 0,
    pet_bottles: 0,
    aluminum_cans: 0,
    plastic_weight: 0,
    aluminum_weight: 0,
    incentives_issued: 0,
    active_alerts_count: 0,
    near_capacity_count: 0,
    online_units_count: 0
  });
  const agentLogs = ref<AgentLog[]>([]);

  // Get assigned machine IDs for the agent
  const viewerAssignmentsComposable = useViewerAssignments();
  
  const getAssignedMachineIds = async (): Promise<number[]> => {
    // First try viewer assignments
    await viewerAssignmentsComposable.fetchMyAssignments();
    const assignedIds = viewerAssignmentsComposable.getAssignedMachineIds();
    
    if (assignedIds.length > 0) {
      console.log('AgentDashboard: Found assigned machines:', assignedIds);
      return assignedIds;
    }
    
    // Fallback: If no specific assignments but agent has merchant_id, get all machines for that merchant
    const auth = useAuthStore();
    console.log('AgentDashboard: No viewer assignments, checking merchant_id:', auth.merchantId);
    
    if (auth.merchantId) {
      const { data: machines } = await supabase
        .from('machines')
        .select('id')
        .eq('merchant_id', auth.merchantId)
        .eq('is_active', true);
      
      console.log('AgentDashboard: Found machines for merchant:', machines?.length);
      return machines?.map(m => m.id) || [];
    }
    
    // Last fallback: Get all active machines (for demo/development)
    console.log('AgentDashboard: No merchant_id, fetching all active machines');
    const { data: allMachines } = await supabase
      .from('machines')
      .select('id')
      .eq('is_active', true)
      .limit(50);
    
    return allMachines?.map(m => m.id) || [];
  };

  // Helper to determine alert severity
  const getAlertSeverity = (statusText: string, isOnline: boolean): 'critical' | 'warning' | 'info' => {
    const lower = statusText.toLowerCase();
    if (lower.includes('bin full') || lower.includes('printer jam')) return 'critical';
    if (!isOnline) return 'critical';
    if (lower.includes('maintenance')) return 'warning';
    return 'info';
  };

  // Helper function to map waste type to label and color
  const mapTypeToLabel = (apiName: string) => {
    if (!apiName) return { label: 'General', color: 'bg-gray-100 text-gray-600' };
    const lower = apiName.toLowerCase();
    
    if (lower.includes('oil') || lower.includes('minyak') || lower.includes('uco')) {
      return { label: 'UCO (Oil)', color: 'bg-orange-100 text-orange-800 border-orange-200' };
    }
    if (lower.includes('paper') || lower.includes('kertas')) {
      return { label: 'Paper', color: 'bg-blue-100 text-blue-800 border-blue-200' };
    }
    if (lower.includes('plastic') || lower.includes('botol') || lower.includes('plastik')) {
      return { label: 'Plastic/Alu', color: 'bg-green-100 text-green-800 border-green-200' };
    }
    return { label: apiName, color: 'bg-gray-100 text-gray-600 border-gray-200' };
  };

  // Sleep helper for API throttling
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Fetch live data from AutoGCM API for machines
  const fetchLiveMachineData = async (machines: MachineWithLiveData[]): Promise<MachineWithLiveData[]> => {
    loadingLive.value = true;
    const updatedMachines: MachineWithLiveData[] = [];
    
    for (const machine of machines) {
      try {
        const apiRes = await getMachineConfig(machine.device_no);
        
        if (apiRes && apiRes.code === 200) {
          const apiConfigs = apiRes.data || [];
          const now = new Date();
          const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
          
          // Get bin configs
          const bin1Config = apiConfigs.find((c: any) => c.positionNo === 1) || {};
          const bin2Config = apiConfigs.find((c: any) => c.positionNo === 2) || {};
          
          // Calculate weights and percentages from live API
          const rawWeight1 = Number(bin1Config.weight || 0);
          const rawWeight2 = Number(bin2Config.weight || 0);
          
          const isFull1 = bin1Config.isFull === true || bin1Config.isFull === 'true';
          const isFull2 = bin2Config.isFull === true || bin2Config.isFull === 'true';
          
          let percent1 = bin1Config.rate ? Math.round(Number(bin1Config.rate)) : 0;
          if (isFull1) percent1 = 100;
          else if (percent1 === 0 && rawWeight1 > 0) {
            const label1 = mapTypeToLabel(bin1Config.rubbishTypeName || machine.config_bin_1 || 'Bin 1').label;
            const capacity = (label1.includes('Oil') || label1.includes('UCO')) ? 400 : 25;
            percent1 = Math.round((rawWeight1 / capacity) * 100);
          }
          
          let percent2 = bin2Config.rate ? Math.round(Number(bin2Config.rate)) : 0;
          if (isFull2) percent2 = 100;
          else if (percent2 === 0 && rawWeight2 > 0) {
            percent2 = Math.round((rawWeight2 / 50) * 100);
          }
          
          // Check machine status
          const hasFault = apiConfigs.some((c: any) => c.status === 2 || c.status === 3);
          const hasActivity = apiConfigs.some((c: any) => c.status === 1);
          const anyBinFull = isFull1 || isFull2;
          
          // Update machine in database with live data
          const { data: dbMachine } = await supabase
            .from('machines')
            .select('last_heartbeat, is_manual_offline')
            .eq('id', machine.id)
            .single();
          
          const lastHeartbeat = dbMachine?.last_heartbeat ? new Date(dbMachine.last_heartbeat) : null;
          const isOnline = !!(lastHeartbeat && lastHeartbeat > fiveMinutesAgo && !dbMachine?.is_manual_offline);
          
          // Determine status
          let statusCode = 0;
          let statusText = 'Offline';
          
          if (dbMachine?.is_manual_offline) {
            statusCode = 3;
            statusText = 'Maintenance (Manual)';
          } else if (!isOnline) {
            statusCode = 0;
            statusText = 'Offline';
          } else if (anyBinFull) {
            statusCode = 4;
            statusText = 'Bin Full';
          } else if (hasFault) {
            statusCode = 3;
            statusText = 'Maintenance';
          } else if (hasActivity) {
            statusCode = 1;
            statusText = 'In Use';
          } else {
            statusCode = 0;
            statusText = 'Online';
          }
          
          // Sync back to database if different
          if (Math.abs(rawWeight1 - (machine.current_bag_weight || 0)) > 0.05 || 
              Math.abs(rawWeight2 - (machine.current_weight_2 || 0)) > 0.05) {
            await supabase.from('machines').update({
              current_bag_weight: rawWeight1,
              current_weight_2: rawWeight2
            }).eq('id', machine.id);
          }
          
          updatedMachines.push({
            ...machine,
            _liveWeight1: rawWeight1,
            _liveWeight2: rawWeight2,
            _livePercent1: percent1,
            _livePercent2: percent2,
            _liveIsFull1: isFull1,
            _liveIsFull2: isFull2,
            _statusCode: statusCode,
            _statusText: statusText,
            _isOnline: isOnline
          });
        } else {
          updatedMachines.push(machine);
        }
      } catch (err) {
        console.error(`Failed to fetch live data for ${machine.device_no}:`, err);
        updatedMachines.push(machine);
      }
      
      await sleep(100); // Throttle API calls
    }
    
    loadingLive.value = false;
    return updatedMachines;
  };

  // Start auto-refresh
  const startAutoRefresh = () => {
    stopAutoRefresh();
    refreshInterval = setInterval(() => {
      console.log('AgentDashboard: Auto-refreshing live data...');
      fetchAgentStats(true);
    }, REFRESH_INTERVAL_MS);
  };

  // Stop auto-refresh
  const stopAutoRefresh = () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  };

  // Fetch all agent dashboard data
  async function fetchAgentStats(forceLiveRefresh = false) {
    const auth = useAuthStore();
    
    if (auth.loading || !auth.role) {
      console.log('AgentDashboard: Waiting for auth/role to be ready...');
      return;
    }

    loading.value = true;

    try {
      // Get assigned machine IDs
      const assignedMachineIds = await getAssignedMachineIds();
      
      console.log('AgentDashboard: Fetching for assigned machines:', assignedMachineIds);

      if (assignedMachineIds.length === 0) {
        // No machines assigned - load empty state
        alerts.value = [];
        verificationQueue.value = [];
        agentMachines.value = [];
        agentLogs.value = [];
        loading.value = false;
        return;
      }

      // ---------------------------------------------------------
      // 1. FETCH CRITICAL ALERTS (with live data if requested)
      // ---------------------------------------------------------
      await fetchAlerts(assignedMachineIds, forceLiveRefresh);

      // ---------------------------------------------------------
      // 2. FETCH VERIFICATION QUEUE
      // ---------------------------------------------------------
      await fetchVerificationQueue(assignedMachineIds);

      // ---------------------------------------------------------
      // 3. FETCH AGENT MACHINES (with live data)
      // ---------------------------------------------------------
      await fetchAgentMachines(assignedMachineIds, forceLiveRefresh);

      // ---------------------------------------------------------
      // 4. FETCH COLLECTION STATS
      // ---------------------------------------------------------
      await fetchCollectionStats(assignedMachineIds);

      // ---------------------------------------------------------
      // 5. FETCH AGENT LOGS
      // ---------------------------------------------------------
      await fetchAgentLogs(assignedMachineIds);

      // Update last updated timestamp
      lastUpdated.value = new Date();

    } catch (err) {
      console.error('AgentDashboard Error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchAlerts(machineIds: number[], useLiveData = false) {
    // Get machines with their current status
    const { data: machines } = await supabase
      .from('machines')
      .select('id, device_no, name, is_active, is_manual_offline, current_bag_weight, current_weight_2, last_heartbeat, config_bin_1, config_bin_2')
      .in('id', machineIds);

    if (!machines) return;

    // If live refresh requested, fetch live data from API
    let machinesWithLiveData = machines as MachineWithLiveData[];
    if (useLiveData) {
      machinesWithLiveData = await fetchLiveMachineData(machinesWithLiveData);
    }

    const newAlerts: AgentAlert[] = [];
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    for (const machine of machinesWithLiveData) {
      // Use live data if available, otherwise fall back to DB
      const weight1 = machine._liveWeight1 !== undefined ? machine._liveWeight1 : (machine.current_bag_weight || 0);
      const weight2 = machine._liveWeight2 !== undefined ? machine._liveWeight2 : (machine.current_weight_2 || 0);
      const isOnline = machine._isOnline !== undefined ? machine._isOnline : 
        !!(machine.last_heartbeat && new Date(machine.last_heartbeat) > fiveMinutesAgo && !machine.is_manual_offline);
      const isFull1 = machine._liveIsFull1 !== undefined ? machine._liveIsFull1 : (weight1 > 20);
      const isFull2 = machine._liveIsFull2 !== undefined ? machine._liveIsFull2 : (weight2 > 40);
      
      // Check if offline (no heartbeat in 5 minutes)
      const lastHeartbeat = machine.last_heartbeat ? new Date(machine.last_heartbeat) : null;
      const isOffline = !lastHeartbeat || lastHeartbeat < fiveMinutesAgo;
      
      // Check bin fill levels (consider full if > 85%)
      const bin1Full = isFull1 || weight1 > 20;
      const bin2Full = isFull2 || weight2 > 40;

      if (isOffline) {
        newAlerts.push({
          id: `offline-${machine.id}`,
          machine_id: machine.id,
          machine_name: machine.name,
          device_no: machine.device_no,
          alert_type: 'NETWORK_DISCONNECTED',
          message: `Machine offline - last heartbeat: ${lastHeartbeat ? lastHeartbeat.toLocaleTimeString() : 'Never'}`,
          severity: 'critical',
          created_at: machine.last_heartbeat || new Date().toISOString()
        });
      }

      if (bin1Full) {
        newAlerts.push({
          id: `bin1-full-${machine.id}`,
          machine_id: machine.id,
          machine_name: machine.name,
          device_no: machine.device_no,
          alert_type: 'BIN_FULL',
          message: `Bin 1 is full (${weight1}kg) - pickup required`,
          severity: 'critical',
          created_at: new Date().toISOString()
        });
      }

      if (bin2Full) {
        newAlerts.push({
          id: `bin2-full-${machine.id}`,
          machine_id: machine.id,
          machine_name: machine.name,
          device_no: machine.device_no,
          alert_type: 'BIN_FULL',
          message: `Bin 2 is full (${weight2}kg) - pickup required`,
          severity: 'critical',
          created_at: new Date().toISOString()
        });
      }
    }

    // Sort by severity (critical first) and date
    alerts.value = newAlerts.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  async function fetchVerificationQueue(machineIds: number[]) {
    // Get device numbers for the assigned machines
    const { data: machines } = await supabase
      .from('machines')
      .select('id, device_no')
      .in('id', machineIds);

    if (!machines || machines.length === 0) {
      verificationQueue.value = [];
      return;
    }

    const deviceNos = machines.map(m => m.device_no);

    // Fetch pending submissions for these machines
    const { data: submissions } = await supabase
      .from('submission_reviews')
      .select('*, users(nickname, avatar_url, phone)')
      .in('device_no', deviceNos)
      .eq('status', 'PENDING')
      .order('submitted_at', { ascending: false })
      .limit(10);

    verificationQueue.value = (submissions || []).map(s => ({
      id: s.id,
      vendor_record_id: s.vendor_record_id,
      user_id: s.user_id,
      phone: s.phone,
      device_no: s.device_no,
      waste_type: s.waste_type,
      photo_url: s.photo_url,
      api_weight: s.api_weight,
      calculated_value: s.calculated_value || 0,
      submitted_at: s.submitted_at,
      users: s.users
    }));
  }

  async function fetchAgentMachines(machineIds: number[], useLiveData = false) {
    const { data: machines } = await supabase
      .from('machines')
      .select('*')
      .in('id', machineIds)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (!machines) {
      agentMachines.value = [];
      return;
    }

    // If live refresh requested, fetch live data from API
    let machinesWithLiveData = machines as MachineWithLiveData[];
    if (useLiveData) {
      machinesWithLiveData = await fetchLiveMachineData(machinesWithLiveData);
    }

    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    agentMachines.value = machinesWithLiveData.map(m => {
      // Use live data if available, otherwise fall back to DB
      const weight1 = m._liveWeight1 !== undefined ? m._liveWeight1 : (m.current_bag_weight || 0);
      const weight2 = m._liveWeight2 !== undefined ? m._liveWeight2 : (m.current_weight_2 || 0);
      const percent1 = m._livePercent1 !== undefined ? m._livePercent1 : Math.min(100, Math.round(((m.current_bag_weight || 0) / 25) * 100));
      const percent2 = m._livePercent2 !== undefined ? m._livePercent2 : Math.min(100, Math.round(((m.current_weight_2 || 0) / 50) * 100));
      const isFull1 = m._liveIsFull1 !== undefined ? m._liveIsFull1 : percent1 >= 85;
      const isFull2 = m._liveIsFull2 !== undefined ? m._liveIsFull2 : percent2 >= 85;
      const isOnline = m._isOnline !== undefined ? m._isOnline : 
        !!(m.last_heartbeat && new Date(m.last_heartbeat) > fiveMinutesAgo && !m.is_manual_offline);
      const statusText = m._statusText || (isOnline ? 'Online' : 'Offline');
      const statusCode = m._statusCode || (isOnline ? 0 : 0);

      // Determine bin color based on status
      const getBinColor = (isFull: boolean, pct: number) => {
        if (isFull) return 'bg-red-100 text-red-800 border-red-200';
        if (pct >= 70) return 'bg-amber-100 text-amber-800 border-amber-200';
        return 'bg-green-100 text-green-800 border-green-200';
      };

      return {
        id: m.id,
        device_no: m.device_no,
        name: m.name,
        address: m.address || '',
        zone: m.zone || 'General',
        isOnline,
        lastHeartbeat: m.last_heartbeat ? new Date(m.last_heartbeat).toLocaleString() : 'Never',
        is_manual_offline: m.is_manual_offline || false,
        statusText,
        statusCode,
        compartments: [
          {
            label: mapTypeToLabel(m._liveWeight1 !== undefined ? (m._liveWeight1 > 0 ? 'Active' : '') : m.config_bin_1 || 'Bin 1').label,
            color: getBinColor(isFull1, percent1),
            weight: weight1.toFixed(2),
            percent: percent1,
            isFull: isFull1
          },
          {
            label: mapTypeToLabel(m._liveWeight2 !== undefined ? (m._liveWeight2 > 0 ? 'Active' : '') : m.config_bin_2 || 'Bin 2').label,
            color: getBinColor(isFull2, percent2),
            weight: weight2.toFixed(2),
            percent: percent2,
            isFull: isFull2
          }
        ]
      };
    });
  }

  async function fetchCollectionStats(machineIds: number[]) {
    // Get device numbers
    const { data: machines } = await supabase
      .from('machines')
      .select('device_no')
      .in('id', machineIds);

    if (!machines || machines.length === 0) return;

    const deviceNos = machines.map(m => m.device_no);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    // Get today's collections with calculated_value for incentives
    const { data: todayData } = await supabase
      .from('submission_reviews')
      .select('waste_type, api_weight, calculated_value')
      .in('device_no', deviceNos)
      .eq('status', 'VERIFIED')
      .gte('submitted_at', todayStr);

    // Get all-time totals for calculating average
    const { data: allTimeData } = await supabase
      .from('submission_reviews')
      .select('waste_type, api_weight, submitted_at')
      .in('device_no', deviceNos)
      .eq('status', 'VERIFIED');

    // Calculate today's totals
    let totalToday = 0;
    let petBottles = 0;
    let aluminumCans = 0;
    let plasticWeight = 0;
    let aluminumWeight = 0;
    let incentivesIssued = 0;

    if (todayData) {
      for (const item of todayData) {
        const weight = Number(item.api_weight) || 0;
        totalToday += weight;
        
        // Sum up incentives (calculated_value represents points/currency)
        incentivesIssued += Number(item.calculated_value) || 0;
        
        const type = (item.waste_type || '').toLowerCase();
        if (type.includes('plastic') || type.includes('pet')) {
          petBottles++;
          plasticWeight += weight;
        } else if (type.includes('alu') || type.includes('aluminum') || type.includes('can')) {
          aluminumCans++;
          aluminumWeight += weight;
        }
      }
    }

    // Calculate daily average (last 30 days)
    let dailyAverage = 0;
    if (allTimeData && allTimeData.length > 0) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentData = allTimeData.filter(d => 
        new Date(d.submitted_at) >= thirtyDaysAgo
      );
      
      if (recentData.length > 0) {
        const totalWeight = recentData.reduce((sum, d) => sum + (Number(d.api_weight) || 0), 0);
        dailyAverage = totalWeight / 30;
      }
    }

    // Calculate derived stats from agentMachines
    const activeAlertsCount = alerts.value.filter(a => 
      a.alert_type === 'BIN_FULL' || 
      a.alert_type === 'PRINTER_JAM' || 
      a.alert_type === 'NETWORK_DISCONNECTED' ||
      a.alert_type === 'OFFLINE'
    ).length;

    const nearCapacityCount = agentMachines.value.filter(m => {
      return m.compartments.some(c => c.percent >= 80);
    }).length;

    const onlineUnitsCount = agentMachines.value.filter(m => m.isOnline).length;

    collectionStats.value = {
      total_collected_today: totalToday,
      daily_target: 50, // Default target - could be configurable
      daily_average: dailyAverage,
      pet_bottles: petBottles,
      aluminum_cans: aluminumCans,
      plastic_weight: plasticWeight,
      aluminum_weight: aluminumWeight,
      incentives_issued: Math.round(incentivesIssued * 100) / 100,
      active_alerts_count: activeAlertsCount,
      near_capacity_count: nearCapacityCount,
      online_units_count: onlineUnitsCount
    };
  }

  async function fetchAgentLogs(machineIds: number[]) {
    // Get device numbers
    const { data: machines } = await supabase
      .from('machines')
      .select('id, device_no, name')
      .in('id', machineIds);

    if (!machines || machines.length === 0) {
      agentLogs.value = [];
      return;
    }

    const deviceNos = machines.map(m => m.device_no);
    const machineMap = new Map(machines.map(m => [m.device_no, m]));

    // Fetch recent cleaning logs (maintenance)
    const { data: cleaningLogs } = await supabase
      .from('cleaning_records')
      .select('*, machines(name)')
      .in('device_no', deviceNos)
      .order('created_at', { ascending: false })
      .limit(10);

    // Fetch recent submissions that were verified (collection events)
    const { data: collectionEvents } = await supabase
      .from('submission_reviews')
      .select('device_no, status, submitted_at')
      .in('device_no', deviceNos)
      .eq('status', 'VERIFIED')
      .order('submitted_at', { ascending: false })
      .limit(10);

    // Combine and format logs
    const logs: AgentLog[] = [];

    if (cleaningLogs) {
      for (const log of cleaningLogs) {
        const machine = machineMap.get(log.device_no);
        logs.push({
          id: `clean-${log.id}`,
          machine_id: log.machine_id,
          machine_name: machine?.name || log.device_no,
          device_no: log.device_no,
          log_type: 'MAINTENANCE',
          description: log.cleaner_name ? `Bin cleaned by ${log.cleaner_name}` : 'Bin cleaned',
          performed_by: log.cleaner_name || 'System',
          created_at: log.created_at
        });
      }
    }

    if (collectionEvents) {
      for (const event of collectionEvents) {
        const machine = machineMap.get(event.device_no);
        logs.push({
          id: `col-${Date.now()}-${Math.random()}`,
          machine_id: 0,
          machine_name: machine?.name || event.device_no,
          device_no: event.device_no,
          log_type: 'COLLECTION',
          description: 'Waste collected and verified',
          performed_by: 'System',
          created_at: event.submitted_at
        });
      }
    }

    // Sort by date descending
    logs.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    agentLogs.value = logs.slice(0, 20);
  }

  // Quick action: Verify a submission
  async function verifySubmission(submissionId: string, approved: boolean) {
    const status = approved ? 'VERIFIED' : 'REJECTED';
    
    const { error } = await supabase
      .from('submission_reviews')
      .update({ status })
      .eq('id', submissionId);

    if (!error) {
      // Remove from queue
      verificationQueue.value = verificationQueue.value.filter(v => v.id !== submissionId);
    }

    return !error;
  }

  // Quick action: Toggle machine offline
  async function toggleMachineStatus(machineId: number, currentStatus: boolean) {
    const { error } = await supabase
      .from('machines')
      .update({ is_manual_offline: !currentStatus })
      .eq('id', machineId);

    if (!error) {
      // Update local state
      const machine = agentMachines.value.find(m => m.id === machineId);
      if (machine) {
        machine.is_manual_offline = !currentStatus;
        machine.isOnline = currentStatus;
      }
    }

    return !error;
  }

  // Quick action: Report an issue
  async function reportIssue(machineId: number, issueType: string, description: string) {
    const { data: machines, error: machineError } = await supabase
      .from('machines')
      .select('device_no, name, merchant_id')
      .eq('id', machineId)
      .single();

    if (machineError || !machines) {
      console.error('AgentDashboard: Error fetching machine:', machineError);
      return false;
    }

    const auth = useAuthStore();
    
    // Build insert data for cleaning_records
    const insertData: any = {
      device_no: machines.device_no,
      waste_type: issueType,
      cleaner_name: auth.user?.email || 'Agent',
      bag_weight_collected: 0,
      cleaned_at: new Date().toISOString(),
      status: 'PENDING',
      admin_note: description
    };
    
    // Add merchant_id if available
    if (machines.merchant_id) {
      insertData.merchant_id = machines.merchant_id;
    }
    
    console.log('AgentDashboard: Creating issue report:', insertData);
    
    // Create a cleaning record entry as issue report
    const { error } = await supabase
      .from('cleaning_records')
      .insert(insertData);

    // Also create a machine report entry for Critical Alerts (shown to both Super Admin and Agent)
    if (!error) {
      const reportTypeMap: Record<string, string> = {
        'MAINTENANCE': 'MAINTENANCE',
        'BIN_FULL': 'BIN_FULL',
        'PRINTER_JAM': 'PRINTER_JAM',
        'NETWORK_DISCONNECTED': 'NETWORK_ISSUE',
        'OFFLINE': 'NETWORK_ISSUE',
        'OTHER': 'OTHER'
      };

      const severityMap: Record<string, 'critical' | 'warning' | 'info'> = {
        'MAINTENANCE': 'warning',
        'BIN_FULL': 'critical',
        'PRINTER_JAM': 'critical',
        'NETWORK_DISCONNECTED': 'critical',
        'OFFLINE': 'critical',
        'OTHER': 'warning'
      };

      const machineReportData = {
        machine_id: machineId,
        device_no: machines.device_no,
        merchant_id: machines.merchant_id,
        report_type: reportTypeMap[issueType] || 'OTHER',
        severity: severityMap[issueType] || 'warning',
        description: description,
        status: 'PENDING',
        reported_by_admin_id: auth.user?.id,
        reported_by_name: auth.user?.email || 'Agent'
      };

      console.log('AgentDashboard: Creating machine report for Critical Alerts:', machineReportData);

      await supabase
        .from('machine_reports')
        .insert(machineReportData);
    }

    if (!error) {
      // Add to logs
      agentLogs.value.unshift({
        id: `issue-${Date.now()}`,
        machine_id: machineId,
        machine_name: machines.name,
        device_no: machines.device_no,
        log_type: 'ISSUE_REPORTED',
        description: `${issueType}: ${description}`,
        performed_by: auth.user?.email || 'Agent',
        created_at: new Date().toISOString()
      });
      
      // Refresh data
      await fetchAgentStats();
    } else {
      console.error('Failed to report issue:', error);
    }

    return !error;
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopAutoRefresh();
  });

  return {
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
    getAssignedMachineIds,
    startAutoRefresh,
    stopAutoRefresh
  };
}
