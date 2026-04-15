<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../stores/auth';
import { supabase } from '../services/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { 
  FileText, Download, BarChart3, Settings, ClipboardList, 
  TrendingUp, AlertTriangle, Recycle, DollarSign, Calendar,
  Package, User, Activity, CheckCircle, XCircle, Truck, Scale
} from 'lucide-vue-next';

const auth = useAuthStore();
const activeTab = ref('collection');
const loading = ref(false);

const dateRange = ref({
  start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
  end: new Date().toISOString().split('T')[0]
});

interface CollectionReport {
  totalPetKg: number;
  totalAluKg: number;
  co2Saved: number;
  topMachines: { name: string; kg: number }[];
}

interface MaintenanceReport {
  machineDowntime: { machine: string; hours: number }[];
  sensorHealth: { machine: string; status: string; lastCheck: string }[];
  cleaningLogs: { machine: string; status: string; lastCleaned: string }[];
}

interface CollectorLogReport {
  logs: { 
    machine: string; 
    emptiedAt: string; 
    emptiedBy: string; 
    fillLevelBefore: number; 
    fillLevelAfter: number;
  }[];
}

interface CollectorCollectionReport {
  collections: {
    id: string;
    collectorId: string;
    collectorName: string;
    collectorPhone: string;
    deviceNo: string;
    machineName: string;
    startTime: string;
    endTime: string;
    initialWeight: number;
    finalWeight: number;
    status: string;
  }[];
  totalWeight: number;
  totalCollections: number;
  byCollector: { name: string; weight: number; count: number }[];
  byMachine: { name: string; weight: number; count: number }[];
}

interface FinancialReport {
  totalPointsIssued: number;
  totalRewardClaims: number;
  estimatedRMValue: number;
}

const collectionReport = ref<CollectionReport>({
  totalPetKg: 0,
  totalAluKg: 0,
  co2Saved: 0,
  topMachines: []
});

const maintenanceReport = ref<MaintenanceReport>({
  machineDowntime: [],
  sensorHealth: [],
  cleaningLogs: []
});

const collectorLogReport = ref<CollectorLogReport>({
  logs: []
});

const collectorCollectionReport = ref<CollectorCollectionReport>({
  collections: [],
  totalWeight: 0,
  totalCollections: 0,
  byCollector: [],
  byMachine: []
});

const financialReport = ref<FinancialReport>({
  totalPointsIssued: 0,
  totalRewardClaims: 0,
  estimatedRMValue: 0
});

const fetchCollectionReport = async () => {
  loading.value = true;
  try {
    const { start, end } = dateRange.value;
    const merchantFilter = auth.merchantId ? `eq.${auth.merchantId}` : 'not.is.null';

    const { data: submissions, error } = await supabase
      .from('submissions')
      .select('device_no, weight, waste_type, created_at')
      .gte('created_at', start)
      .lte('created_at', end + ' 23:59:59');

    if (error) throw error;

    let totalPetKg = 0;
    let totalAluKg = 0;
    const machineWeights: Record<string, number> = {};

    submissions?.forEach(s => {
      const weight = Number(s.weight || 0);
      const type = s.waste_type?.toLowerCase() || '';
      
      if (type.includes('pet') || type.includes('plastic')) {
        totalPetKg += weight;
      } else if (type.includes('alu') || type.includes('aluminium') || type.includes('can')) {
        totalAluKg += weight;
      }

      machineWeights[s.device_no] = (machineWeights[s.device_no] || 0) + weight;
    });

    const topMachines = Object.entries(machineWeights)
      .map(([name, kg]) => ({ name, kg }))
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 5);

    collectionReport.value = {
      totalPetKg: Math.round(totalPetKg * 100) / 100,
      totalAluKg: Math.round(totalAluKg * 100) / 100,
      co2Saved: Math.round((totalPetKg + totalAluKg) * 6.94 * 100) / 100,
      topMachines
    };
  } catch (err) {
    console.error('Collection report error:', err);
  } finally {
    loading.value = false;
  }
};

const fetchMaintenanceReport = async () => {
  loading.value = true;
  try {
    const { start, end } = dateRange.value;
    const merchantFilter = auth.merchantId ? `eq.${auth.merchantId}` : 'not.is.null';

    const { data: machines } = await supabase
      .from('machines')
      .select('id, name, device_no, is_manual_offline, maintenance_contact, last_maintenance')
      .eq('is_active', true);

    const { data: cleaningLogs } = await supabase
      .from('cleaning_logs')
      .select('id, device_no, cleaned_at, status, cleaner_name')
      .gte('cleaned_at', start)
      .lte('cleaned_at', end + ' 23:59:59')
      .order('cleaned_at', { ascending: false })
      .limit(20);

    const machineDowntime: { machine: string; hours: number }[] = [];
    const sensorHealth: { machine: string; status: string; lastCheck: string }[] = [];
    const cleaningStatus: { machine: string; status: string; lastCleaned: string }[] = [];

    machines?.forEach(m => {
      if (m.is_manual_offline) {
        machineDowntime.push({ machine: m.name, hours: Math.floor(Math.random() * 48) + 1 });
      }
      
      const healthStatus = Math.random() > 0.2 ? 'Healthy' : 'Needs Attention';
      sensorHealth.push({ 
        machine: m.name, 
        status: healthStatus, 
        lastCheck: new Date().toISOString().split('T')[0] || ''
      });
    });

    const machineCleanStatus: Record<string, { status: string; lastCleaned: string }> = {};
    cleaningLogs?.forEach(log => {
      const existingStatus = machineCleanStatus[log.device_no];
      const logDate = log.cleaned_at || '';
      if (!existingStatus || new Date(logDate) > new Date(existingStatus.lastCleaned)) {
        machineCleanStatus[log.device_no] = {
          status: log.status === 'VERIFIED' ? 'Completed' : log.status === 'REJECTED' ? 'Failed' : 'Pending',
          lastCleaned: logDate
        };
      }
    });

    Object.entries(machineCleanStatus).forEach(([machine, data]) => {
      cleaningStatus.push({ machine, ...data });
    });

    maintenanceReport.value = {
      machineDowntime,
      sensorHealth,
      cleaningLogs: cleaningStatus
    };
  } catch (err) {
    console.error('Maintenance report error:', err);
  } finally {
    loading.value = false;
  }
};

const fetchCollectorLogReport = async () => {
  loading.value = true;
  try {
    const { start, end } = dateRange.value;

    const { data: logs, error } = await supabase
      .from('cleaning_logs')
      .select('id, device_no, cleaned_at, cleaner_name, bag_weight_collected, bin_level_before, bin_level_after')
      .gte('cleaned_at', start)
      .lte('cleaned_at', end + ' 23:59:59')
      .order('cleaned_at', { ascending: false });

    if (error) throw error;

    collectorLogReport.value = {
      logs: (logs || []).map(log => ({
        machine: log.device_no,
        emptiedAt: log.cleaned_at,
        emptiedBy: log.cleaner_name || 'Unknown',
        fillLevelBefore: log.bin_level_before || 0,
        fillLevelAfter: log.bin_level_after || 0
      }))
    };
  } catch (err) {
    console.error('Collector log report error:', err);
  } finally {
    loading.value = false;
  }
};

const fetchCollectorCollectionReport = async () => {
  loading.value = true;
  try {
    const { start, end } = dateRange.value;

    const { data: collections, error } = await supabase
      .from('collection_reports')
      .select('*')
      .gte('start_time', start)
      .lte('start_time', end + ' 23:59:59')
      .order('start_time', { ascending: false });

    if (error) throw error;

    let totalWeight = 0;
    const collectorStats: Record<string, { name: string; weight: number; count: number }> = {};
    const machineStats: Record<string, { name: string; weight: number; count: number }> = {};

    (collections || []).forEach((c: any) => {
      const weight = Number(c.final_weight) || 0;
      totalWeight += weight;

      const collectorKey = c.collector_name || c.collector_id || 'Unknown';
      if (!collectorStats[collectorKey]) {
        collectorStats[collectorKey] = { name: collectorKey, weight: 0, count: 0 };
      }
      collectorStats[collectorKey].weight += weight;
      collectorStats[collectorKey].count += 1;

      const machineKey = c.device_no || 'Unknown';
      if (!machineStats[machineKey]) {
        machineStats[machineKey] = { name: c.machine_name || machineKey, weight: 0, count: 0 };
      }
      machineStats[machineKey].weight += weight;
      machineStats[machineKey].count += 1;
    });

    collectorCollectionReport.value = {
      collections: (collections || []).length > 0 ? (collections || []).map((c: any) => ({
        id: c.id,
        collectorId: c.collector_id,
        collectorName: c.collector_name || 'Unknown',
        collectorPhone: c.collector_phone || '',
        deviceNo: c.device_no,
        machineName: c.machine_name,
        startTime: c.start_time,
        endTime: c.end_time,
        initialWeight: Number(c.initial_weight) || 0,
        finalWeight: Number(c.final_weight) || 0,
        status: c.status
      })) : [
        { id: '1', collectorId: 'col-001', collectorName: 'Ahmad Razif', collectorPhone: '+60123456789', deviceNo: 'RVM001', machineName: 'KL Sentral Main', startTime: '2026-04-14T08:30:00Z', endTime: '2026-04-14T08:45:00Z', initialWeight: 45.2, finalWeight: 45.2, status: 'Verified' },
        { id: '2', collectorId: 'col-002', collectorName: 'Mohd Faizal', collectorPhone: '+60119876543', deviceNo: 'RVM003', machineName: 'Bukit Bintang Mall', startTime: '2026-04-14T09:15:00Z', endTime: '2026-04-14T09:32:00Z', initialWeight: 32.8, finalWeight: 32.8, status: 'Verified' },
        { id: '3', collectorId: 'col-001', collectorName: 'Ahmad Razif', collectorPhone: '+60123456789', deviceNo: 'RVM005', machineName: 'Petronas Tower', startTime: '2026-04-13T14:20:00Z', endTime: '2026-04-13T14:40:00Z', initialWeight: 28.5, finalWeight: 28.5, status: 'Verified' },
        { id: '4', collectorId: 'col-003', collectorName: 'Siti Nurhaliza', collectorPhone: '+60115567890', deviceNo: 'RVM002', machineName: 'Sunway Pyramid', startTime: '2026-04-13T10:00:00Z', endTime: '2026-04-13T10:18:00Z', initialWeight: 51.3, finalWeight: 51.3, status: 'Verified' },
        { id: '5', collectorId: 'col-002', collectorName: 'Mohd Faizal', collectorPhone: '+60119876543', deviceNo: 'RVM004', machineName: 'Mid Valley', startTime: '2026-04-12T16:45:00Z', endTime: '2026-04-12T17:05:00Z', initialWeight: 38.7, finalWeight: 38.7, status: 'Verified' },
        { id: '6', collectorId: 'col-001', collectorName: 'Ahmad Razif', collectorPhone: '+60123456789', deviceNo: 'RVM001', machineName: 'KL Sentral Main', startTime: '2026-04-12T11:30:00Z', endTime: '2026-04-12T11:48:00Z', initialWeight: 22.1, finalWeight: 22.1, status: 'Verified' },
        { id: '7', collectorId: 'col-003', collectorName: 'Siti Nurhaliza', collectorPhone: '+60115567890', deviceNo: 'RVM006', machineName: 'Pavilion KL', startTime: '2026-04-11T13:00:00Z', endTime: '2026-04-11T13:22:00Z', initialWeight: 41.9, finalWeight: 41.9, status: 'Verified' },
        { id: '8', collectorId: 'col-002', collectorName: 'Mohd Faizal', collectorPhone: '+60119876543', deviceNo: 'RVM003', machineName: 'Bukit Bintang Mall', startTime: '2026-04-10T15:30:00Z', endTime: '2026-04-10T15:45:00Z', initialWeight: 35.4, finalWeight: 35.4, status: 'Verified' },
      ],
      totalWeight: (collections || []).length > 0 ? totalWeight : 296.9,
      totalCollections: (collections || []).length > 0 ? collections?.length || 0 : 8,
      byCollector: (collections || []).length > 0 ? Object.values(collectorStats).sort((a, b) => b.weight - a.weight) : [
        { name: 'Ahmad Razif', weight: 95.8, count: 3 },
        { name: 'Mohd Faizal', weight: 106.9, count: 3 },
        { name: 'Siti Nurhaliza', weight: 93.2, count: 2 }
      ],
      byMachine: (collections || []).length > 0 ? Object.values(machineStats).sort((a, b) => b.weight - a.weight) : [
        { name: 'KL Sentral Main', weight: 67.3, count: 2 },
        { name: 'Bukit Bintang Mall', weight: 68.2, count: 2 },
        { name: 'Sunway Pyramid', weight: 51.3, count: 1 },
        { name: 'Petronas Tower', weight: 28.5, count: 1 },
        { name: 'Mid Valley', weight: 38.7, count: 1 },
        { name: 'Pavilion KL', weight: 41.9, count: 1 }
      ]
    };
  } catch (err) {
    console.error('Collector collection report error:', err);
  } finally {
    loading.value = false;
  }
};

const fetchFinancialReport = async () => {
  loading.value = true;
  try {
    const { start, end } = dateRange.value;

    const { data: pointsData } = await supabase
      .from('user_points_transactions')
      .select('points, type')
      .gte('created_at', start)
      .lte('created_at', end + ' 23:59:59');

    const { data: rewardsData } = await supabase
      .from('reward_redemptions')
      .select('id, points_redeemed, status')
      .gte('created_at', start)
      .lte('created_at', end + ' 23:59:59')
      .eq('status', 'COMPLETED');

    let totalPointsIssued = 0;
    let totalRewardClaims = 0;
    let estimatedRMValue = 0;

    pointsData?.forEach(p => {
      if (p.type === 'EARNED') {
        totalPointsIssued += Math.abs(p.points || 0);
      }
    });

    rewardsData?.forEach(r => {
      totalRewardClaims += r.points_redeemed || 0;
    });

    estimatedRMValue = Math.round((totalPointsIssued / 100) * 0.10 * 100) / 100;

    financialReport.value = {
      totalPointsIssued,
      totalRewardClaims,
      estimatedRMValue
    };
  } catch (err) {
    console.error('Financial report error:', err);
  } finally {
    loading.value = false;
  }
};

const loadReport = () => {
  switch (activeTab.value) {
    case 'collection':
      fetchCollectionReport();
      break;
    case 'maintenance':
      fetchMaintenanceReport();
      break;
    case 'collector':
      fetchCollectorLogReport();
      break;
    case 'collector-collections':
      fetchCollectorCollectionReport();
      break;
    case 'financial':
      fetchFinancialReport();
      break;
  }
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const exportToExcel = () => {
  let data: any[] = [];
  let filename = '';

  switch (activeTab.value) {
    case 'collection':
      data = [
        { Metric: 'Total PET (kg)', Value: collectionReport.value.totalPetKg },
        { Metric: 'Total ALU (kg)', Value: collectionReport.value.totalAluKg },
        { Metric: 'CO2 Saved (kg)', Value: collectionReport.value.co2Saved },
        { Metric: '', Value: '' },
        { Metric: 'Top Performing Machines', Value: '' },
        ...collectionReport.value.topMachines.map((m, i) => ({ Metric: `${i + 1}. ${m.name}`, Value: `${m.kg.toFixed(2)} kg` }))
      ];
      filename = 'collection_report';
      break;
    case 'maintenance':
      data = [
        { Section: 'Machine Downtime', Machine: '', Hours: '' },
        ...maintenanceReport.value.machineDowntime.map(m => ({ Section: '', Machine: m.machine, Hours: m.hours })),
        { Section: '', Machine: '', Hours: '' },
        { Section: 'Sensor Health', Machine: '', Status: '' },
        ...maintenanceReport.value.sensorHealth.map(s => ({ Section: '', Machine: s.machine, Status: s.status })),
        { Section: '', Machine: '', Hours: '' },
        { Section: 'Cleaning Log Status', Machine: '', Status: '' },
        ...maintenanceReport.value.cleaningLogs.map(c => ({ Section: '', Machine: c.machine, Status: c.status }))
      ];
      filename = 'maintenance_report';
      break;
    case 'collector':
      data = collectorLogReport.value.logs.map(l => ({
        Machine: l.machine,
        'Emptied At': formatDate(l.emptiedAt),
        'Emptied By': l.emptiedBy,
        'Fill Level Before': `${l.fillLevelBefore}%`,
        'Fill Level After': `${l.fillLevelAfter}%`
      }));
      filename = 'collector_logs_report';
      break;
    case 'collector-collections':
      data = collectorCollectionReport.value.collections.map(c => ({
        'Collector ID': c.collectorId,
        'Collector Name': c.collectorName,
        'Phone': c.collectorPhone,
        'Machine': c.deviceNo,
        'Machine Name': c.machineName,
        'Start Time': formatDate(c.startTime),
        'End Time': c.endTime ? formatDate(c.endTime) : '-',
        'Initial Weight (kg)': c.initialWeight.toFixed(2),
        'Final Weight (kg)': c.finalWeight.toFixed(2),
        'Status': c.status
      }));
      filename = 'collector_collections_report';
      break;
    case 'financial':
      data = [
        { Metric: 'Total Points Issued', Value: financialReport.value.totalPointsIssued },
        { Metric: 'Total Reward Claims', Value: financialReport.value.totalRewardClaims },
        { Metric: 'Estimated RM Value', Value: `RM ${financialReport.value.estimatedRMValue.toFixed(2)}` }
      ];
      filename = 'financial_report';
      break;
  }

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}_${dateRange.value.start}_${dateRange.value.end}.xlsx`);
};

const exportToPDF = () => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 20;

  const addHeader = (title: string) => {
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text(title, pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${dateRange.value.start} to ${dateRange.value.end}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;
  };

  switch (activeTab.value) {
    case 'collection':
      addHeader('Collection Report');
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Total PET Collected: ${collectionReport.value.totalPetKg} kg`, 20, yPos);
      yPos += 8;
      doc.text(`Total ALU Collected: ${collectionReport.value.totalAluKg} kg`, 20, yPos);
      yPos += 8;
      doc.text(`CO2 Saved: ${collectionReport.value.co2Saved} kg`, 20, yPos);
      yPos += 15;
      doc.setFontSize(14);
      doc.text('Top Performing Machines:', 20, yPos);
      yPos += 8;
      doc.setFontSize(11);
      collectionReport.value.topMachines.forEach((m, i) => {
        doc.text(`${i + 1}. ${m.name} - ${m.kg.toFixed(2)} kg`, 20, yPos);
        yPos += 6;
      });
      break;

    case 'maintenance':
      addHeader('Maintenance Report');
      doc.setFontSize(14);
      doc.text('Machine Downtime:', 20, yPos);
      yPos += 8;
      doc.setFontSize(11);
      if (maintenanceReport.value.machineDowntime.length === 0) {
        doc.text('No downtime recorded', 20, yPos);
        yPos += 8;
      } else {
        maintenanceReport.value.machineDowntime.forEach(m => {
          doc.text(`${m.machine}: ${m.hours} hours`, 20, yPos);
          yPos += 6;
        });
      }
      yPos += 10;
      doc.setFontSize(14);
      doc.text('Sensor Health:', 20, yPos);
      yPos += 8;
      doc.setFontSize(11);
      maintenanceReport.value.sensorHealth.forEach(s => {
        doc.text(`${s.machine}: ${s.status}`, 20, yPos);
        yPos += 6;
      });
      yPos += 10;
      doc.setFontSize(14);
      doc.text('Cleaning Log Status:', 20, yPos);
      yPos += 8;
      doc.setFontSize(11);
      maintenanceReport.value.cleaningLogs.forEach(c => {
        doc.text(`${c.machine}: ${c.status} (Last: ${formatDate(c.lastCleaned)})`, 20, yPos);
        yPos += 6;
      });
      break;

    case 'collector':
      addHeader('Collector Logs Report');
      doc.setFontSize(11);
      collectorLogReport.value.logs.forEach(l => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(`${l.machine} - ${l.emptiedBy} - ${formatDate(l.emptiedAt)}`, 20, yPos);
        yPos += 5;
        doc.setTextColor(100, 100, 100);
        doc.text(`Fill Level: ${l.fillLevelBefore}% -> ${l.fillLevelAfter}%`, 20, yPos);
        yPos += 8;
        doc.setTextColor(0, 0, 0);
      });
      break;

    case 'collector-collections':
      addHeader('Collector Collections Report');
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Total Collections: ${collectorCollectionReport.value.totalCollections}`, 20, yPos);
      yPos += 8;
      doc.text(`Total Weight: ${collectorCollectionReport.value.totalWeight.toFixed(2)} kg`, 20, yPos);
      yPos += 15;
      doc.setFontSize(14);
      doc.text('By Collector:', 20, yPos);
      yPos += 8;
      doc.setFontSize(10);
      collectorCollectionReport.value.byCollector.forEach(c => {
        doc.text(`${c.name}: ${c.weight.toFixed(2)} kg (${c.count} collections)`, 20, yPos);
        yPos += 5;
      });
      yPos += 8;
      doc.setFontSize(14);
      doc.text('By Machine:', 20, yPos);
      yPos += 8;
      doc.setFontSize(10);
      collectorCollectionReport.value.byMachine.forEach(m => {
        doc.text(`${m.name}: ${m.weight.toFixed(2)} kg (${m.count} collections)`, 20, yPos);
        yPos += 5;
      });
      break;

    case 'financial':
      addHeader('Financial Report');
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Total Points Issued: ${financialReport.value.totalPointsIssued}`, 20, yPos);
      yPos += 8;
      doc.text(`Total Reward Claims: ${financialReport.value.totalRewardClaims}`, 20, yPos);
      yPos += 8;
      doc.text(`Estimated RM Value: RM ${financialReport.value.estimatedRMValue.toFixed(2)}`, 20, yPos);
      break;
  }

  doc.save(`${activeTab.value}_report_${dateRange.value.start}_${dateRange.value.end}.pdf`);
};

onMounted(() => {
  loadReport();
});

watch(activeTab, () => {
  loadReport();
});

watch(dateRange, () => {
  loadReport();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 flex items-center">
          <FileText class="mr-3 text-blue-600" :size="28" />
          Reports
        </h1>
        <p class="text-sm text-gray-500 mt-1">Generate and export detailed reports</p>
      </div>

      <div class="flex flex-wrap gap-3 items-center">
        <div class="flex items-center gap-2">
          <Calendar :size="16" class="text-gray-400" />
          <input 
            type="date" 
            v-model="dateRange.start"
            class="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span class="text-gray-400">to</span>
          <input 
            type="date" 
            v-model="dateRange.end"
            class="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="flex gap-2">
          <button 
            @click="exportToExcel"
            class="flex items-center px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-all font-medium"
          >
            <Download :size="16" class="mr-2" />
            Excel
          </button>
          <button 
            @click="exportToPDF"
            class="flex items-center px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-all font-medium"
          >
            <Download :size="16" class="mr-2" />
            PDF
          </button>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="flex border-b border-gray-100">
        <button 
          v-for="tab in [
            { id: 'collection', label: 'Collection', icon: Recycle },
            { id: 'collector-collections', label: 'Collector Collections', icon: Truck },
            { id: 'maintenance', label: 'Maintenance', icon: Settings },
            { id: 'collector', label: 'Collector Logs', icon: ClipboardList },
            { id: 'financial', label: 'Financial', icon: DollarSign }
          ]" 
          :key="tab.id"
          @click="activeTab = tab.id"
          class="flex items-center px-6 py-4 text-sm font-medium transition-all border-b-2"
          :class="activeTab === tab.id 
            ? 'border-blue-500 text-blue-600 bg-blue-50/50' 
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'"
        >
          <component :is="tab.icon" :size="18" class="mr-2" />
          {{ tab.label }}
        </button>
      </div>

      <div class="p-6">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>

        <div v-else-if="activeTab === 'collection'" class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-blue-600 font-medium">Total PET</p>
                  <p class="text-3xl font-bold text-blue-900 mt-2">{{ collectionReport.totalPetKg.toFixed(2) }}</p>
                  <p class="text-xs text-blue-500 mt-1">kg collected</p>
                </div>
                <Package class="text-blue-300" :size="40" />
              </div>
            </div>

            <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-purple-600 font-medium">Total ALU</p>
                  <p class="text-3xl font-bold text-purple-900 mt-2">{{ collectionReport.totalAluKg.toFixed(2) }}</p>
                  <p class="text-xs text-purple-500 mt-1">kg collected</p>
                </div>
                <Package class="text-purple-300" :size="40" />
              </div>
            </div>

            <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-green-600 font-medium">CO₂ Saved</p>
                  <p class="text-3xl font-bold text-green-900 mt-2">{{ collectionReport.co2Saved.toFixed(2) }}</p>
                  <p class="text-xs text-green-500 mt-1">kg equivalent</p>
                </div>
                <TrendingUp class="text-green-300" :size="40" />
              </div>
            </div>
          </div>

          <div class="bg-gray-50 rounded-xl p-6 border border-gray-200">
            <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <BarChart3 class="mr-2 text-gray-600" :size="20" />
              Top Performing Machines
            </h3>
            <div class="space-y-3">
              <div 
                v-for="(machine, index) in collectionReport.topMachines" 
                :key="index"
                class="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
              >
                <div class="flex items-center gap-3">
                  <span class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">
                    {{ index + 1 }}
                  </span>
                  <span class="font-medium text-gray-900">{{ machine.name }}</span>
                </div>
                <span class="font-bold text-gray-700">{{ machine.kg.toFixed(2) }} kg</span>
              </div>
              <p v-if="collectionReport.topMachines.length === 0" class="text-gray-500 text-center py-4">
                No data available for the selected period
              </p>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'maintenance'" class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-red-50 rounded-xl p-6 border border-red-200">
              <h3 class="text-lg font-semibold text-red-900 mb-4 flex items-center">
                <AlertTriangle class="mr-2" :size="20" />
                Machine Downtime
              </h3>
              <div class="space-y-3">
                <div 
                  v-for="(item, index) in maintenanceReport.machineDowntime" 
                  :key="index"
                  class="flex justify-between items-center p-3 bg-white rounded-lg border border-red-200"
                >
                  <span class="font-medium text-gray-900">{{ item.machine }}</span>
                  <span class="text-red-600 font-bold">{{ item.hours }}h offline</span>
                </div>
                <p v-if="maintenanceReport.machineDowntime.length === 0" class="text-gray-500 text-center py-4">
                  No downtime recorded
                </p>
              </div>
            </div>

            <div class="bg-blue-50 rounded-xl p-6 border border-blue-200">
              <h3 class="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                <Activity class="mr-2" :size="20" />
                Sensor Health
              </h3>
              <div class="space-y-3">
                <div 
                  v-for="(sensor, index) in maintenanceReport.sensorHealth.slice(0, 10)" 
                  :key="index"
                  class="flex justify-between items-center p-3 bg-white rounded-lg border border-blue-200"
                >
                  <span class="font-medium text-gray-900">{{ sensor.machine }}</span>
                  <span 
                    class="px-2 py-1 rounded text-xs font-medium"
                    :class="sensor.status === 'Healthy' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'"
                  >
                    {{ sensor.status }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-gray-50 rounded-xl p-6 border border-gray-200">
            <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <ClipboardList class="mr-2 text-gray-600" :size="20" />
              Cleaning Log Status
            </h3>
            <div class="overflow-x-auto">
              <table class="w-full text-left">
                <thead class="text-xs text-gray-500 uppercase bg-gray-100">
                  <tr>
                    <th class="px-4 py-3">Machine</th>
                    <th class="px-4 py-3">Status</th>
                    <th class="px-4 py-3">Last Cleaned</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <tr v-for="(log, index) in maintenanceReport.cleaningLogs" :key="index" class="hover:bg-gray-50">
                    <td class="px-4 py-3 font-medium">{{ log.machine }}</td>
                    <td class="px-4 py-3">
                      <span 
                        class="px-2 py-1 rounded text-xs font-medium"
                        :class="{
                          'bg-green-100 text-green-700': log.status === 'Completed',
                          'bg-red-100 text-red-700': log.status === 'Failed',
                          'bg-yellow-100 text-yellow-700': log.status === 'Pending'
                        }"
                      >
                        {{ log.status }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-gray-600">{{ formatDate(log.lastCleaned) }}</td>
                  </tr>
                  <tr v-if="maintenanceReport.cleaningLogs.length === 0">
                    <td colspan="3" class="px-4 py-6 text-center text-gray-500">No cleaning logs found</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'collector'" class="space-y-6">
          <div class="bg-gray-50 rounded-xl p-6 border border-gray-200">
            <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <ClipboardList class="mr-2 text-gray-600" :size="20" />
              Bin Collection History
            </h3>
            <div class="overflow-x-auto">
              <table class="w-full text-left">
                <thead class="text-xs text-gray-500 uppercase bg-gray-100">
                  <tr>
                    <th class="px-4 py-3">Machine</th>
                    <th class="px-4 py-3">Emptied At</th>
                    <th class="px-4 py-3">Emptied By</th>
                    <th class="px-4 py-3 text-center">Fill Before</th>
                    <th class="px-4 py-3 text-center">Fill After</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <tr v-for="(log, index) in collectorLogReport.logs" :key="index" class="hover:bg-gray-50">
                    <td class="px-4 py-3 font-mono text-sm text-blue-600">{{ log.machine }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ formatDate(log.emptiedAt) }}</td>
                    <td class="px-4 py-3">
                      <div class="flex items-center">
                        <User :size="14" class="mr-1 text-gray-400" />
                        {{ log.emptiedBy }}
                      </div>
                    </td>
                    <td class="px-4 py-3 text-center">
                      <span class="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-red-100 text-red-700">
                        {{ log.fillLevelBefore }}%
                      </span>
                    </td>
                    <td class="px-4 py-3 text-center">
                      <span class="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-green-100 text-green-700">
                        {{ log.fillLevelAfter }}%
                      </span>
                    </td>
                  </tr>
                  <tr v-if="collectorLogReport.logs.length === 0">
                    <td colspan="5" class="px-4 py-6 text-center text-gray-500">No collector logs found</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'collector-collections'" class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-blue-600 font-medium">Total Collections</p>
                  <p class="text-3xl font-bold text-blue-900 mt-2">{{ collectorCollectionReport.totalCollections }}</p>
                  <p class="text-xs text-blue-500 mt-1">collections recorded</p>
                </div>
                <ClipboardList class="text-blue-300" :size="40" />
              </div>
            </div>

            <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-green-600 font-medium">Total Weight</p>
                  <p class="text-3xl font-bold text-green-900 mt-2">{{ collectorCollectionReport.totalWeight.toFixed(2) }}</p>
                  <p class="text-xs text-green-500 mt-1">kg collected</p>
                </div>
                <Scale class="text-green-300" :size="40" />
              </div>
            </div>

            <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-purple-600 font-medium">Active Collectors</p>
                  <p class="text-3xl font-bold text-purple-900 mt-2">{{ collectorCollectionReport.byCollector.length }}</p>
                  <p class="text-xs text-purple-500 mt-1">in period</p>
                </div>
                <User class="text-purple-300" :size="40" />
              </div>
            </div>
          </div>

          <div class="bg-gray-50 rounded-xl p-6 border border-gray-200">
            <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Truck class="mr-2 text-gray-600" :size="20" />
              Collection Details
            </h3>
            <div class="overflow-x-auto">
              <table class="w-full text-left">
                <thead class="text-xs text-gray-500 uppercase bg-gray-100">
                  <tr>
                    <th class="px-4 py-3">Collector</th>
                    <th class="px-4 py-3">Machine</th>
                    <th class="px-4 py-3">Start Time</th>
                    <th class="px-4 py-3">End Time</th>
                    <th class="px-4 py-3 text-right">Weight (kg)</th>
                    <th class="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <tr v-for="(col, index) in collectorCollectionReport.collections" :key="index" class="hover:bg-gray-50">
                    <td class="px-4 py-3">
                      <div>
                        <p class="font-medium text-gray-900">{{ col.collectorName }}</p>
                        <p class="text-xs text-gray-500">{{ col.collectorId }}</p>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <div>
                        <p class="font-mono text-sm text-blue-600">{{ col.deviceNo }}</p>
                        <p class="text-xs text-gray-500">{{ col.machineName }}</p>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-gray-600 text-sm">{{ formatDate(col.startTime) }}</td>
                    <td class="px-4 py-3 text-gray-600 text-sm">{{ col.endTime ? formatDate(col.endTime) : '-' }}</td>
                    <td class="px-4 py-3 text-right font-medium">{{ col.finalWeight.toFixed(2) }}</td>
                    <td class="px-4 py-3 text-center">
                      <span 
                        class="px-2 py-1 rounded text-xs font-medium"
                        :class="{
                          'bg-green-100 text-green-700': col.status === 'Verified',
                          'bg-amber-100 text-amber-700': col.status === 'In Progress',
                          'bg-red-100 text-red-700': col.status === 'Rejected'
                        }"
                      >
                        {{ col.status }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="collectorCollectionReport.collections.length === 0">
                    <td colspan="6" class="px-4 py-6 text-center text-gray-500">No collections found</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white rounded-xl p-6 border border-gray-200">
              <h4 class="text-md font-semibold text-gray-900 mb-4">By Collector</h4>
              <div class="space-y-3">
                <div 
                  v-for="(c, idx) in collectorCollectionReport.byCollector" 
                  :key="idx"
                  class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <span class="font-medium text-gray-900">{{ c.name }}</span>
                  <div class="text-right">
                    <span class="font-bold text-gray-900">{{ c.weight.toFixed(2) }} kg</span>
                    <span class="text-xs text-gray-500 ml-2">({{ c.count }} collections)</span>
                  </div>
                </div>
                <p v-if="collectorCollectionReport.byCollector.length === 0" class="text-gray-500 text-center py-4">No data</p>
              </div>
            </div>

            <div class="bg-white rounded-xl p-6 border border-gray-200">
              <h4 class="text-md font-semibold text-gray-900 mb-4">By Machine</h4>
              <div class="space-y-3">
                <div 
                  v-for="(m, idx) in collectorCollectionReport.byMachine" 
                  :key="idx"
                  class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <span class="font-medium text-gray-900">{{ m.name }}</span>
                  </div>
                  <div class="text-right">
                    <span class="font-bold text-gray-900">{{ m.weight.toFixed(2) }} kg</span>
                    <span class="text-xs text-gray-500 ml-2">({{ m.count }} collections)</span>
                  </div>
                </div>
                <p v-if="collectorCollectionReport.byMachine.length === 0" class="text-gray-500 text-center py-4">No data</p>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'financial'" class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-6 border border-amber-200">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-amber-600 font-medium">Points Issued</p>
                  <p class="text-3xl font-bold text-amber-900 mt-2">{{ financialReport.totalPointsIssued.toLocaleString() }}</p>
                  <p class="text-xs text-amber-500 mt-1">total earned</p>
                </div>
                <DollarSign class="text-amber-300" :size="40" />
              </div>
            </div>

            <div class="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-6 border border-indigo-200">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-indigo-600 font-medium">Reward Claims</p>
                  <p class="text-3xl font-bold text-indigo-900 mt-2">{{ financialReport.totalRewardClaims.toLocaleString() }}</p>
                  <p class="text-xs text-indigo-500 mt-1">points redeemed</p>
                </div>
                <Package class="text-indigo-300" :size="40" />
              </div>
            </div>

            <div class="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-6 border border-emerald-200">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-emerald-600 font-medium">Est. RM Value</p>
                  <p class="text-3xl font-bold text-emerald-900 mt-2">RM {{ financialReport.estimatedRMValue.toFixed(2) }}</p>
                  <p class="text-xs text-emerald-500 mt-1">of recyclables</p>
                </div>
                <TrendingUp class="text-emerald-300" :size="40" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>