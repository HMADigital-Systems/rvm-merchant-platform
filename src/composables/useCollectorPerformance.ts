import { ref, computed } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';

export interface CollectorPerformance {
  collector_id: string;
  collector_email: string;
  collector_name: string;
  total_machines_serviced: number;
  total_collections: number;
  pet_weight_kg: number;
  aluminum_weight_kg: number;
  uco_weight_kg: number;
  total_weight_kg: number;
  co2_offset_kg: number;
}

export interface CollectorActivityLog {
  id: string;
  machine_id: number;
  machine_name: string;
  machine_location: string;
  pet_weight_kg: number;
  aluminum_weight_kg: number;
  uco_weight_kg: number;
  total_weight_kg: number;
  collected_at: string;
}

const CO2_FACTOR_PLASTIC = 3.0;
const CO2_FACTOR_ALUMINUM = 8.0;
const CO2_FACTOR_UCO = 2.5;

export function useCollectorPerformance() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const auth = useAuthStore();

  const collectorPerformance = ref<CollectorPerformance[]>([]);
  const selectedCollectorLogs = ref<CollectorActivityLog[]>([]);
  const selectedCollector = ref<CollectorPerformance | null>(null);
  const showDetailModal = ref(false);

  const getCurrentMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  const calculateCO2Offset = (pet: number, aluminum: number, uco: number) => {
    return (pet * CO2_FACTOR_PLASTIC) + (aluminum * CO2_FACTOR_ALUMINUM) + (uco * CO2_FACTOR_UCO);
  };

  const fetchCollectorPerformance = async () => {
    loading.value = true;
    error.value = null;

    try {
      const { start, end } = getCurrentMonthRange();

      const { data: wasteLogs, error: logsError } = await supabase
        .from('waste_logs')
        .select(`
          id,
          machine_id,
          collector_id,
          collector_email,
          pet_weight_kg,
          aluminum_weight_kg,
          uco_weight_kg,
          collected_at,
          machines(name, address)
        `)
        .gte('collected_at', start)
        .lte('collected_at', end + 'T23:59:59')
        .order('collected_at', { ascending: false });

      if (logsError) throw logsError;

      const performanceMap = new Map<string, CollectorPerformance>();

      for (const log of wasteLogs || []) {
        const collectorId = log.collector_id;

        if (!performanceMap.has(collectorId)) {
          performanceMap.set(collectorId, {
            collector_id: collectorId,
            collector_email: log.collector_email,
            collector_name: log.collector_email?.split('@')[0] || 'Unknown',
            total_machines_serviced: 0,
            total_collections: 0,
            pet_weight_kg: 0,
            aluminum_weight_kg: 0,
            uco_weight_kg: 0,
            total_weight_kg: 0,
            co2_offset_kg: 0
          });
        }

        const perf = performanceMap.get(collectorId)!;
        perf.total_collections++;
        perf.pet_weight_kg += log.pet_weight_kg || 0;
        perf.aluminum_weight_kg += log.aluminum_weight_kg || 0;
        perf.uco_weight_kg += log.uco_weight_kg || 0;
        perf.total_weight_kg += (log.pet_weight_kg || 0) + (log.aluminum_weight_kg || 0) + (log.uco_weight_kg || 0);
        perf.co2_offset_kg = calculateCO2Offset(perf.pet_weight_kg, perf.aluminum_weight_kg, perf.uco_weight_kg);
      }

      const machineCountMap = new Map<string, Set<number>>();
      for (const log of wasteLogs || []) {
        if (!machineCountMap.has(log.collector_id)) {
          machineCountMap.set(log.collector_id, new Set());
        }
        machineCountMap.get(log.collector_id)!.add(log.machine_id);
      }

      for (const [collectorId, machines] of machineCountMap) {
        if (performanceMap.has(collectorId)) {
          performanceMap.get(collectorId)!.total_machines_serviced = machines.size;
        }
      }

      collectorPerformance.value = Array.from(performanceMap.values()).sort(
        (a, b) => b.total_weight_kg - a.total_weight_kg
      );
    } catch (e: any) {
      error.value = e.message;
      console.error('Error fetching collector performance:', e);
    } finally {
      loading.value = false;
    }
  };

  const viewCollectorDetail = async (collector: CollectorPerformance) => {
    selectedCollector.value = collector;
    loading.value = true;

    try {
      const { start, end } = getCurrentMonthRange();

      const { data: wasteLogs, error: logsError } = await supabase
        .from('waste_logs')
        .select(`
          id,
          machine_id,
          pet_weight_kg,
          aluminum_weight_kg,
          uco_weight_kg,
          collected_at,
          machines(name, address)
        `)
        .eq('collector_id', collector.collector_id)
        .gte('collected_at', start)
        .lte('collected_at', end + 'T23:59:59')
        .order('collected_at', { ascending: false });

      if (logsError) throw logsError;

      selectedCollectorLogs.value = (wasteLogs || []).map((log: any) => ({
        id: log.id,
        machine_id: log.machine_id,
        machine_name: log.machines?.name || `Machine #${log.machine_id}`,
        machine_location: log.machines?.address || 'Unknown Location',
        pet_weight_kg: log.pet_weight_kg || 0,
        aluminum_weight_kg: log.aluminum_weight_kg || 0,
        uco_weight_kg: log.uco_weight_kg || 0,
        total_weight_kg: (log.pet_weight_kg || 0) + (log.aluminum_weight_kg || 0) + (log.uco_weight_kg || 0),
        collected_at: log.collected_at
      }));

      showDetailModal.value = true;
    } catch (e: any) {
      console.error('Error fetching collector detail:', e);
    } finally {
      loading.value = false;
    }
  };

  const closeDetailModal = () => {
    showDetailModal.value = false;
    selectedCollector.value = null;
    selectedCollectorLogs.value = [];
  };

  const exportToExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const { start, end } = getCurrentMonthRange();

      const workbook = XLSX.utils.book_new();

      const summaryData = collectorPerformance.value.map(perf => ({
        'Collector Name': perf.collector_name,
        'Email': perf.collector_email,
        'Machines Serviced': perf.total_machines_serviced,
        'Total Collections': perf.total_collections,
        'PET Plastic (kg)': perf.pet_weight_kg.toFixed(2),
        'Aluminum (kg)': perf.aluminum_weight_kg.toFixed(2),
        'UCO (kg)': perf.uco_weight_kg.toFixed(2),
        'Total Weight (kg)': perf.total_weight_kg.toFixed(2),
        'CO2 Offset (kg)': perf.co2_offset_kg.toFixed(2)
      }));

      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summaryWs, 'Summary');

      for (const perf of collectorPerformance.value) {
        const { data: logs } = await supabase
          .from('waste_logs')
          .select(`
            id,
            machine_id,
            pet_weight_kg,
            aluminum_weight_kg,
            uco_weight_kg,
            collected_at,
            machines(name, address)
          `)
          .eq('collector_id', perf.collector_id)
          .gte('collected_at', start)
          .lte('collected_at', end + 'T23:59:59')
          .order('collected_at', { ascending: false });

        const logData = (logs || []).map((log: any) => ({
          'Timestamp': new Date(log.collected_at).toLocaleString(),
          'Machine ID': log.machine_id,
          'Machine Name': log.machines?.name || `Machine #${log.machine_id}`,
          'Location': log.machines?.address || 'Unknown',
          'PET Plastic (kg)': (log.pet_weight_kg || 0).toFixed(2),
          'Aluminum (kg)': (log.aluminum_weight_kg || 0).toFixed(2),
          'UCO (kg)': (log.uco_weight_kg || 0).toFixed(2),
          'Total Weight (kg)': ((log.pet_weight_kg || 0) + (log.aluminum_weight_kg || 0) + (log.uco_weight_kg || 0)).toFixed(2)
        }));

        const ws = XLSX.utils.json_to_sheet(logData);
        const sheetName = perf.collector_name.slice(0, 31);
        XLSX.utils.book_append_sheet(workbook, ws, sheetName);
      }

      const currentDate = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `collector-performance-${currentDate}.xlsx`);
    } catch (e) {
      console.error('Error exporting to Excel:', e);
    }
  };

  return {
    loading,
    error,
    collectorPerformance,
    selectedCollectorLogs,
    selectedCollector,
    showDetailModal,
    fetchCollectorPerformance,
    viewCollectorDetail,
    closeDetailModal,
    exportToExcel
  };
}
