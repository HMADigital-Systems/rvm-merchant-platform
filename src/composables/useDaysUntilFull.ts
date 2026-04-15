import { ref, computed } from 'vue';
import { supabase } from '../services/supabase';

interface DaysUntilFullResponse {
  id: number;
  device_no: string;
  name: string;
  estimated_full_days: number | null;
  full_estimate_label: string;
}

export function useDaysUntilFull() {
  const machineEstimates = ref<Map<number, DaysUntilFullResponse>>(new Map());
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchDaysUntilFull(machineId?: number) {
    loading.value = true;
    error.value = null;

    try {
      let url = '/api/days-until-full';
      if (machineId) {
        url += `?machine_id=${machineId}`;
      }

      const response = await fetch(url);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch');
      }

      // Store in map for quick lookup
      for (const machine of result.data) {
        machineEstimates.value.set(machine.id, machine);
      }

      return result.data;
    } catch (err: any) {
      error.value = err.message;
      console.error('Days Until Full Error:', err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  async function calculateLocalDaysUntilFull(
    machineId: number | string,
    currentWeight: number,
    totalCapacity: number = 50
  ): Promise<number | null> {
    const binCapacity = totalCapacity;
    const remainingCapacity = binCapacity - currentWeight;

    if (remainingCapacity <= 0) return 0;
    if (remainingCapacity >= binCapacity) return null;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: submissions, error } = await supabase
      .from('submission_reviews')
      .select('api_weight, submitted_at')
      .eq('device_no', machineId)
      .gte('submitted_at', sevenDaysAgo.toISOString())
      .eq('status', 'VERIFIED');

    if (error || !submissions || submissions.length === 0) {
      return Math.round(remainingCapacity / 5); // Estimate ~5kg/day
    }

const dailyWeights: Record<string, number> = {};
    for (const sub of submissions) {
      const date = new Date(sub.submitted_at).toISOString().split('T')[0];
      if (!date) continue;
      dailyWeights[date] = (dailyWeights[date] ?? 0) + (sub.api_weight ?? 0);
    }

    const daysWithData = Object.keys(dailyWeights).length;
    const totalWeight = Object.values(dailyWeights).reduce((sum, w) => sum + w, 0);
    const averageDailyRate = totalWeight / daysWithData;

    if (averageDailyRate <= 0) {
      return Math.round(remainingCapacity / 5);
    }

    return Math.round(remainingCapacity / averageDailyRate);
  }

  function getDaysLabel(days: number | null): string {
    if (days === null) return 'No Data';
    if (days === 0) return 'FULL';
    if (days === 1) return '1 Day';
    return `${days} Days`;
  }

  function getDaysColor(days: number | null): string {
    if (days === null) return 'text-gray-500';
    if (days === 0) return 'text-red-600 bg-red-100';
    if (days <= 2) return 'text-red-500 bg-red-50';
    if (days <= 5) return 'text-amber-500 bg-amber-50';
    return 'text-green-600 bg-green-50';
  }

  return {
    machineEstimates,
    loading,
    error,
    fetchDaysUntilFull,
    calculateLocalDaysUntilFull,
    getDaysLabel,
    getDaysColor
  };
}
