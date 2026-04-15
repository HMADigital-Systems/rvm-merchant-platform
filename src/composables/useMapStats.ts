import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';

export interface MachineStats {
  day: { volume: number; submissions: number; newUsers: number; points: number };
  week: { volume: number; submissions: number; newUsers: number; points: number };
  month: { volume: number; submissions: number; newUsers: number; points: number };
  hourlyBreakdown: { hour: number; weight: number }[];
  dailyBreakdown: { date: string; day: string; weight: number }[];
}

export interface GlobalTotals {
  totalWeight: number;
  totalSubmissions: number;
  totalUsers: number;
  todayWeight: number;
  todaySubmissions: number;
  weekWeight: number;
  weekSubmissions: number;
}

const globalTotals = ref<GlobalTotals>({
  totalWeight: 0,
  totalSubmissions: 0,
  totalUsers: 0,
  todayWeight: 0,
  todaySubmissions: 0,
  weekWeight: 0,
  weekSubmissions: 0
});

const machineStats = ref<Record<string, MachineStats>>({});
const statsLoading = ref(false);

export function useMapStats() {
  const auth = useAuthStore();

  const fetchMachineStats = async (machineId: string): Promise<MachineStats | null> => {
    // Return cached if available
    if (machineStats.value[machineId]) {
      return machineStats.value[machineId];
    }

    statsLoading.value = true;
    try {
      const response = await fetch(`/api/machine-stats?id=${encodeURIComponent(machineId)}`);
      const result = await response.json();

      if (result.success && result.stats) {
        machineStats.value[machineId] = result.stats;
        return result.stats;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch machine stats:', error);
      return null;
    } finally {
      statsLoading.value = false;
    }
  };

  const fetchGlobalTotals = async () => {
    try {
      const authStore = useAuthStore();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);

      // Get total stats (all time)
      const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Today's stats
      const { data: todayData } = await supabase
        .from('submission_reviews')
        .select('id, api_weight')
        .gte('created_at', todayStart.toISOString())
        .in('status', ['VERIFIED', 'APPROVED']);
      
      // This week's stats
      const { data: weekData } = await supabase
        .from('submission_reviews')
        .select('id, api_weight')
        .gte('created_at', weekStart.toISOString())
        .in('status', ['VERIFIED', 'APPROVED']);

      // All time stats
      const { data: allTimeData } = await supabase
        .from('submission_reviews')
        .select('id, api_weight')
        .in('status', ['VERIFIED', 'APPROVED'])
        .limit(50000);

      const todayWeight = todayData?.reduce((sum, r) => sum + (Number(r.api_weight) || 0), 0) || 0;
      const todaySubmissions = todayData?.length || 0;
      const weekWeight = weekData?.reduce((sum, r) => sum + (Number(r.api_weight) || 0), 0) || 0;
      const weekSubmissions = weekData?.length || 0;
      const totalWeight = allTimeData?.reduce((sum, r) => sum + (Number(r.api_weight) || 0), 0) || 0;
      const totalSubmissions = allTimeData?.length || 0;

      globalTotals.value = {
        totalWeight: Math.round(totalWeight * 100) / 100,
        totalSubmissions,
        totalUsers: totalUsers || 0,
        todayWeight: Math.round(todayWeight * 100) / 100,
        todaySubmissions,
        weekWeight: Math.round(weekWeight * 100) / 100,
        weekSubmissions
      };
    } catch (error) {
      console.error('Failed to fetch global totals:', error);
    }
  };

  return {
    globalTotals,
    machineStats,
    statsLoading,
    fetchMachineStats,
    fetchGlobalTotals
  };
}