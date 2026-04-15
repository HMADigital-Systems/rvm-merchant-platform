import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import { useMachineStore } from '../stores/machines';
import { storeToRefs } from 'pinia';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

export interface ImpactData {
  petWeight: number;
  aluminumWeight: number;
  totalCo2Saved: number;
  treesEquivalent: number;
  totalWeight: number;
}

export interface DailyImpactRow {
  date: string;
  petWeight: number;
  aluminumWeight: number;
  totalWeight: number;
  co2Saved: number;
  treesEquivalent: number;
}

export type DateRangeFilter = 'daily' | 'weekly' | 'monthly' | 'custom';

export function useImpactExport() {
  const loading = ref(false);
  const auth = useAuthStore();
  const machineStore = useMachineStore();
  const { machines } = storeToRefs(machineStore);
  const CO2_FACTOR_PET = 1.5;
  const CO2_FACTOR_ALUMINUM = 9.0;
  const CO2_PER_TREE = 20;

  const dateRangeOptions = [
    { value: 'daily', label: 'Daily', days: 1 },
    { value: 'weekly', label: 'Weekly', days: 7 },
    { value: 'monthly', label: 'Monthly', days: 30 }
  ];

  const getDateRange = (filter: DateRangeFilter | 'custom', customStart?: string, customEnd?: string): { start: string; end: string } => {
    const now = new Date();
    const end = now.toISOString().split('T')[0] ?? '';
    let start: string;

    if (filter === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }

    switch (filter) {
      case 'daily':
        start = end;
        break;
      case 'weekly':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? end;
        break;
      case 'monthly':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? end;
        break;
      default:
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? end;
    }
    return { start, end };
  };

  const fetchImpactData = async (startDate: string, endDate: string, machineIds?: number[]): Promise<{ impact: ImpactData; dailyBreakdown: DailyImpactRow[] }> => {
    loading.value = true;
    try {
      let query = supabase
        .from('submission_reviews')
        .select('waste_type, api_weight, submitted_at, device_no')
        .gte('submitted_at', startDate)
        .lte('submitted_at', endDate + 'T23:59:59')
        .eq('status', 'VERIFIED');

      if (auth.merchantId) {
        query = query.eq('merchant_id', auth.merchantId);
      }

      if (machineIds && machineIds.length > 0) {
        const deviceNos = machineIds.map(id => {
          const machine = machines.value.find(m => m.id === id);
          return machine?.deviceNo || String(id);
        });
        query = query.in('device_no', deviceNos);
      }

      const { data, error } = await query;
      
      if (error) throw error;

      if (data && data.length > 0) {
        const weightByType: Record<string, number> = {};
        const dailyMap = new Map<string, DailyImpactRow>();
        
        data.forEach((s: any) => {
          const wasteType = s.waste_type || 'default';
          const weight = s.api_weight || 0;
          
          weightByType[wasteType] = (weightByType[wasteType] || 0) + weight;
          
          const dateStr = new Date(s.submitted_at).toISOString().split('T')[0] || '';
          if (!dailyMap.has(dateStr)) {
            dailyMap.set(dateStr, { date: dateStr, petWeight: 0, aluminumWeight: 0, totalWeight: 0, co2Saved: 0, treesEquivalent: 0 });
          }
          const day = dailyMap.get(dateStr)!;
          day.totalWeight += weight;
          
          if (wasteType.toLowerCase().includes('plastic') || wasteType.toLowerCase().includes('pet')) {
            day.petWeight += weight;
          } else if (wasteType.toLowerCase().includes('aluminum') || wasteType.toLowerCase().includes('can')) {
            day.aluminumWeight += weight;
          }
        });

        const totalWeight = Object.values(weightByType).reduce((sum, w) => sum + w, 0);
        
        const getCO2Factor = (wt: string): number => {
          const lower = wt.toLowerCase();
          if (lower.includes('aluminum') || lower.includes('can')) return 9.0;
          if (lower.includes('paper')) return 0.5;
          if (lower.includes('uco') || lower.includes('oil')) return 0.8;
          return 1.5;
        };

        let totalCo2Saved = 0;
        for (const [wasteType, weight] of Object.entries(weightByType)) {
          totalCo2Saved += weight * getCO2Factor(wasteType);
        }

        const treesEquivalent = totalCo2Saved / CO2_PER_TREE;

        const petWeight = weightByType['PET'] || weightByType['PET Plastic'] || 0;
        const aluminumWeight = weightByType['Aluminum'] || weightByType['aluminum'] || 0;

        dailyMap.forEach(day => {
          day.co2Saved = (day.petWeight * CO2_FACTOR_PET) + (day.aluminumWeight * CO2_FACTOR_ALUMINUM);
          day.treesEquivalent = day.co2Saved / CO2_PER_TREE;
        });

        const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        return {
          impact: { petWeight, aluminumWeight, totalCo2Saved, treesEquivalent, totalWeight },
          dailyBreakdown
        };
      }

      return { impact: { petWeight: 0, aluminumWeight: 0, totalCo2Saved: 0, treesEquivalent: 0, totalWeight: 0 }, dailyBreakdown: [] };
    } finally {
      loading.value = false;
    }
  };

  const generateDemoData = (startDate: string, endDate: string) => {
    const totalWeight = Math.floor(Math.random() * 5000) + 1000;
    const petWeight = Math.floor(totalWeight * 0.7);
    const aluminumWeight = totalWeight - petWeight;
    const totalCo2Saved = (petWeight * CO2_FACTOR_PET) + (aluminumWeight * CO2_FACTOR_ALUMINUM);
    const treesEquivalent = totalCo2Saved / CO2_PER_TREE;

    const dailyBreakdown: DailyImpactRow[] = [];
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    const dayDiff = Math.ceil((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    for (let d = 0; d < dayDiff; d++) {
      const date = new Date(startObj);
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().split('T')[0] ?? '';
      const baseWeight = Math.floor(totalWeight / dayDiff);
      const variance = Math.floor(Math.random() * 40) - 20;
      const dayWeight = Math.max(10, baseWeight + variance);
      const dayPet = Math.floor(dayWeight * 0.7);
      const dayAluminum = dayWeight - dayPet;
      const dayCo2 = (dayPet * CO2_FACTOR_PET) + (dayAluminum * CO2_FACTOR_ALUMINUM);

      dailyBreakdown.push({
        date: dateStr,
        petWeight: dayPet,
        aluminumWeight: dayAluminum,
        totalWeight: dayWeight,
        co2Saved: dayCo2,
        treesEquivalent: dayCo2 / CO2_PER_TREE
      });
    }

    return {
      impact: { petWeight, aluminumWeight, totalCo2Saved, treesEquivalent, totalWeight },
      dailyBreakdown
    };
  };

  const downloadPDF = async (filter: DateRangeFilter, customStart?: string, customEnd?: string, machineIds?: number[]) => {
    loading.value = true;
    try {
      const { start, end } = getDateRange(filter, customStart, customEnd);
      const { impact, dailyBreakdown } = await fetchImpactData(start, end, machineIds);

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const brandName = 'RVM Merchant Platform';

      doc.setFillColor(16, 185, 129);
      doc.rect(0, 0, pageWidth, 40, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text(brandName, 20, 25);

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Environmental Impact Report', 20, 35);

      doc.setTextColor(100, 100, 100);
      doc.setFontSize(10);
      doc.text(`Period: ${start} to ${end}`, pageWidth - 60, 25);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 60, 35);

      let yPos = 55;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', 20, yPos);

      yPos += 15;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');

      const summaryData = [
        ['Total Weight Recycled', `${impact.totalWeight.toFixed(1)} kg`],
        ['Total CO₂ Saved', `${impact.totalCo2Saved.toFixed(1)} kg`],
        ['Trees Equivalent', `${impact.treesEquivalent.toFixed(1)} trees`]
      ];

      summaryData.forEach((row) => {
        doc.text(row[0] ?? '', 20, yPos);
        doc.text(row[1] ?? '', 80, yPos);
        yPos += 10;
      });

      yPos += 10;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Breakdown by Material', 20, yPos);

      yPos += 15;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');

      const materialData = [
        ['PET Plastic', `${impact.petWeight.toFixed(1)} kg`, `(× ${CO2_FACTOR_PET})`],
        ['Aluminum', `${impact.aluminumWeight.toFixed(1)} kg`, `(× ${CO2_FACTOR_ALUMINUM})`]
      ];

      materialData.forEach((row) => {
        doc.text(row[0] ?? '', 20, yPos);
        doc.text(row[1] ?? '', 80, yPos);
        doc.setTextColor(100, 100, 100);
        doc.text(row[2] ?? '', 120, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 10;
      });

      yPos += 10;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Daily Breakdown', 20, yPos);

      yPos += 10;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Date', 20, yPos);
      doc.text('PET (kg)', 60, yPos);
      doc.text('Aluminum (kg)', 95, yPos);
      doc.text('Total (kg)', 130, yPos);
      doc.text('CO₂ (kg)', 165, yPos);

      yPos += 5;
      doc.setDrawColor(200, 200, 200);
      doc.line(20, yPos, 190, yPos);
      yPos += 7;

      doc.setFont('helvetica', 'normal');
      dailyBreakdown.slice(0, 20).forEach((day) => {
        if (yPos > 280) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(day.date, 20, yPos);
        doc.text(day.petWeight.toFixed(1), 60, yPos);
        doc.text(day.aluminumWeight.toFixed(1), 95, yPos);
        doc.text(day.totalWeight.toFixed(1), 130, yPos);
        doc.text(day.co2Saved.toFixed(1), 165, yPos);
        yPos += 7;
      });

      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFillColor(240, 240, 240);
      doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text('Generated by RVM Merchant Platform - Environmental Impact Report', 20, pageHeight - 8);

      doc.save(`Environmental_Impact_Report_${filter}_${new Date().toISOString().split('T')[0]}.pdf`);
    } finally {
      loading.value = false;
    }
  };

  const downloadExcel = async (filter: DateRangeFilter, customStart?: string, customEnd?: string, machineIds?: number[]) => {
    loading.value = true;
    try {
      const { start, end } = getDateRange(filter, customStart, customEnd);
      const { impact, dailyBreakdown } = await fetchImpactData(start, end, machineIds);

      const wb = XLSX.utils.book_new();

      const summaryRows = [
        ['Environmental Impact Report'],
        [''],
        ['Period', `${start} to ${end}`],
        ['Generated', new Date().toLocaleDateString()],
        [''],
        ['Summary'],
        ['Total Weight Recycled (kg)', impact.totalWeight.toFixed(1)],
        ['Total CO₂ Saved (kg)', impact.totalCo2Saved.toFixed(1)],
        ['Trees Equivalent', impact.treesEquivalent.toFixed(1)],
        [''],
        ['Material Breakdown'],
        ['Material', 'Weight (kg)', 'CO₂ Factor'],
        ['PET Plastic', impact.petWeight.toFixed(1), CO2_FACTOR_PET],
        ['Aluminum', impact.aluminumWeight.toFixed(1), CO2_FACTOR_ALUMINUM]
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      const dailyRows = dailyBreakdown.map(day => ({
        'Date': day.date,
        'PET Plastic (kg)': day.petWeight,
        'Aluminum (kg)': day.aluminumWeight,
        'Total Weight (kg)': day.totalWeight,
        'CO₂ Saved (kg)': day.co2Saved,
        'Trees Equivalent': day.treesEquivalent
      }));

      const wsDetails = XLSX.utils.json_to_sheet(dailyRows);
      const wscols = Object.keys(dailyRows[0] || {}).map(() => ({ wch: 18 }));
      wsDetails['!cols'] = wscols;
      XLSX.utils.book_append_sheet(wb, wsDetails, 'Daily Breakdown');

      const roleText = auth.role === 'SUPER_ADMIN' ? 'Super_Admin' : 'User';
      XLSX.writeFile(wb, `Environmental_Impact_Report_${filter}_${roleText}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } finally {
      loading.value = false;
    }
  };

  return {
    loading,
    dateRangeOptions,
    downloadPDF,
    downloadExcel,
    getDateRange,
    fetchImpactData
  };
}