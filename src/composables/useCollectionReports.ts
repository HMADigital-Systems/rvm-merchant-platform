import { ref, computed } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';

export interface CollectorSummary {
  collector_id: string;
  total_weight: number;
  total_quantity: number;
  total_value: number;
}

export interface LocationSummary {
  location: string;
  total_weight: number;
  total_quantity: number;
  total_value: number;
}

export interface CollectionLog {
  id: string;
  collector_id: string;
  device_no: string;
  waste_type: string;
  weight: number;
  value: number;
  timestamp: string;
  status: string;
}

export function useCollectionReports() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const auth = useAuthStore();
  
  const collectionSummary = ref<{
    total_collected: { weight: number; quantity: number; value: number };
    by_collector: CollectorSummary[];
    by_location: LocationSummary[];
  } | null>(null);
  
  const collectorLogs = ref<CollectionLog[]>([]);
  
  const filters = ref({
    startDate: '',
    endDate: '',
    collectorId: '',
    location: '',
    groupBy: 'collector' as 'collector' | 'location'
  });

  const currentPage = ref(1);
  const itemsPerPage = ref(10);
  const totalLogs = ref(0);

  const paginatedLogs = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value;
    return collectorLogs.value.slice(start, start + itemsPerPage.value);
  });

  const totalPages = computed(() => Math.ceil(collectorLogs.value.length / itemsPerPage.value));

  const fetchCollectionSummary = async () => {
    loading.value = true;
    error.value = null;
    console.log('[CollectionReports] fetchCollectionSummary called, auth:', auth.role, auth.merchantId);
    
    try {
      let query = supabase
        .from('submission_reviews')
        .select('*');

      if (filters.value.startDate) {
        query = query.gte('submitted_at', filters.value.startDate);
      }
      if (filters.value.endDate) {
        query = query.lte('submitted_at', filters.value.endDate + 'T23:59:59');
      }

      if (auth.merchantId && auth.role !== 'VIEWER') {
        console.log('[CollectionReports] Applying merchant filter:', auth.merchantId);
        query = query.eq('merchant_id', auth.merchantId);
      }

      const { data: reviews, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Demo fallback: generate random data if no real data
      if (!reviews || reviews.length === 0) {
        const randomWeight = Math.floor(Math.random() * 5000) + 1000;
        const randomQuantity = Math.floor(Math.random() * 200) + 50;
        const randomValue = Math.floor(randomWeight * 0.5);
        
        collectionSummary.value = {
          total_collected: { weight: randomWeight, quantity: randomQuantity, value: randomValue },
          by_collector: [
            { collector_id: 'user-001', total_weight: randomWeight * 0.4, total_quantity: Math.floor(randomQuantity * 0.4), total_value: Math.floor(randomValue * 0.4) },
            { collector_id: 'user-002', total_weight: randomWeight * 0.35, total_quantity: Math.floor(randomQuantity * 0.35), total_value: Math.floor(randomValue * 0.35) },
            { collector_id: 'user-003', total_weight: randomWeight * 0.25, total_quantity: Math.floor(randomQuantity * 0.25), total_value: Math.floor(randomValue * 0.25) }
          ],
          by_location: [
            { location: 'Machine-A1', total_weight: randomWeight * 0.3, total_quantity: Math.floor(randomQuantity * 0.3), total_value: Math.floor(randomValue * 0.3) },
            { location: 'Machine-B2', total_weight: randomWeight * 0.25, total_quantity: Math.floor(randomQuantity * 0.25), total_value: Math.floor(randomValue * 0.25) },
            { location: 'Machine-C3', total_weight: randomWeight * 0.2, total_quantity: Math.floor(randomQuantity * 0.2), total_value: Math.floor(randomValue * 0.2) },
            { location: 'Machine-D4', total_weight: randomWeight * 0.25, total_quantity: Math.floor(randomQuantity * 0.25), total_value: Math.floor(randomValue * 0.25) }
          ]
        };
        loading.value = false;
        return;
      }

      const byCollector: Record<string, { collector_id: string, total_weight: number, total_quantity: number, total_value: number }> = {};
      const byLocation: Record<string, { location: string, total_weight: number, total_quantity: number, total_value: number }> = {};

      if (reviews) {
        for (const r of reviews) {
          const collectorId = r.user_id || 'unknown';
          if (!byCollector[collectorId]) {
            byCollector[collectorId] = { collector_id: collectorId, total_weight: 0, total_quantity: 0, total_value: 0 };
          }
          byCollector[collectorId].total_weight += Number(r.api_weight) || 0;
          byCollector[collectorId].total_quantity += 1;
          byCollector[collectorId].total_value += Number(r.calculated_value) || 0;

          const location = r.device_no || 'unknown';
          if (!byLocation[location]) {
            byLocation[location] = { location, total_weight: 0, total_quantity: 0, total_value: 0 };
          }
          byLocation[location].total_weight += Number(r.api_weight) || 0;
          byLocation[location].total_quantity += 1;
          byLocation[location].total_value += Number(r.calculated_value) || 0;
        }
      }

      const totalWeight = Object.values(byCollector).reduce((sum, c) => sum + c.total_weight, 0);
      const totalQuantity = Object.values(byCollector).reduce((sum, c) => sum + c.total_quantity, 0);
      const totalValue = Object.values(byCollector).reduce((sum, c) => sum + c.total_value, 0);

      collectionSummary.value = {
        total_collected: {
          weight: totalWeight,
          quantity: totalQuantity,
          value: totalValue
        },
        by_collector: Object.values(byCollector),
        by_location: Object.values(byLocation)
      };
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch collection data';
    } finally {
      loading.value = false;
    }
  };

  const fetchCollectorLogs = async (page = 1) => {
    loading.value = true;
    currentPage.value = page;
    console.log('[CollectionReports] fetchCollectorLogs called, auth:', auth.role, auth.merchantId);
    
    try {
      const offset = (page - 1) * itemsPerPage.value;
      
      let query = supabase
        .from('submission_reviews')
        .select('id, user_id, device_no, waste_type, api_weight, calculated_value, submitted_at, status', { count: 'exact' })
        .order('submitted_at', { ascending: false })
        .range(offset, offset + itemsPerPage.value - 1);

      if (filters.value.startDate) {
        query = query.gte('submitted_at', filters.value.startDate);
      }
      if (filters.value.endDate) {
        query = query.lte('submitted_at', filters.value.endDate + 'T23:59:59');
      }
      if (filters.value.collectorId) {
        query = query.eq('user_id', filters.value.collectorId);
      }
      if (filters.value.location) {
        query = query.eq('device_no', filters.value.location);
      }

      if (auth.merchantId && auth.role !== 'VIEWER') {
        console.log('[CollectionReports] Applying merchant filter to logs:', auth.merchantId);
        query = query.eq('merchant_id', auth.merchantId);
      }

      const { data, error: fetchError, count } = await query;

      if (fetchError) throw fetchError;

      collectorLogs.value = (data || []).map(log => ({
        id: log.id,
        collector_id: log.user_id,
        device_no: log.device_no,
        waste_type: log.waste_type,
        weight: log.api_weight,
        value: log.calculated_value,
        timestamp: log.submitted_at,
        status: log.status
      }));
      
      totalLogs.value = count || 0;

      // Demo fallback: generate random data if no real data
      if (collectorLogs.value.length === 0) {
        const demoLogs = [];
        for (let i = 0; i < 15; i++) {
          demoLogs.push({
            id: `demo-${i}`,
            collector_id: `user-00${(i % 3) + 1}`,
            device_no: `DEV-${String.fromCharCode(65 + (i % 4))}${Math.floor(i / 4) + 1}`,
            waste_type: ['PET Plastic', 'Aluminum', 'Paper', 'UCO'][i % 4] as string,
            weight: Math.floor(Math.random() * 50) + 10,
            value: Math.floor(Math.random() * 25) + 5,
            timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
            status: ['PENDING', 'VERIFIED', 'REJECTED'][i % 3] as string
          });
        }
        collectorLogs.value = demoLogs as CollectionLog[];
        totalLogs.value = demoLogs.length;
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch collector logs';
    } finally {
      loading.value = false;
    }
  };

  const fetchAll = async () => {
    await Promise.all([
      fetchCollectionSummary(),
      fetchCollectorLogs(1)
    ]);
  };

  const clearFilters = () => {
    filters.value = {
      startDate: '',
      endDate: '',
      collectorId: '',
      location: '',
      groupBy: 'collector'
    };
    fetchAll();
  };

  const applyFilters = () => {
    fetchAll();
  };

  const exportToCsv = () => {
    if (!collectionSummary.value) return;

    const { by_collector, by_location, total_collected } = collectionSummary.value;
    
    let csvContent = 'Collection Report Export\n';
    csvContent += `Generated: ${new Date().toISOString()}\n\n`;
    
    csvContent += `Total Collected\n`;
    csvContent += `Weight,Quantity,Value\n`;
    csvContent += `${total_collected.weight.toFixed(2)},${total_collected.quantity},${total_collected.value.toFixed(2)}\n\n`;

    if (filters.value.groupBy === 'collector') {
      csvContent += 'By Collector\n';
      csvContent += 'Collector ID,Total Weight,Total Quantity,Total Value\n';
      by_collector.forEach(c => {
        csvContent += `${c.collector_id},${c.total_weight.toFixed(2)},${c.total_quantity},${c.total_value.toFixed(2)}\n`;
      });
    } else {
      csvContent += 'By Location\n';
      csvContent += 'Location,Total Weight,Total Quantity,Total Value\n';
      by_location.forEach(l => {
        csvContent += `${l.location},${l.total_weight.toFixed(2)},${l.total_quantity},${l.total_value.toFixed(2)}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `collection-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return {
    loading,
    error,
    collectionSummary,
    collectorLogs,
    filters,
    currentPage,
    itemsPerPage,
    totalLogs,
    paginatedLogs,
    totalPages,
    fetchCollectionSummary,
    fetchCollectorLogs,
    fetchAll,
    clearFilters,
    applyFilters,
    exportToCsv
  };
}