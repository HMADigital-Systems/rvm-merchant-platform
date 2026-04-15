import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';

export interface LeaderboardUser {
  rank: number;
  user_id: string;
  nickname: string;
  email: string;
  total_weight: number;
  carbon_saved: number;
  total_points: number;
  submission_count: number;
  multiplier: string;
}

export interface MonthlyChampion {
  id: string;
  user_id: string;
  nickname: string;
  email: string;
  rank: number;
  total_weight: number;
  total_points: number;
  month: string;
  year: number;
  archived_at: string;
}

export function useAdminLeaderboard() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const auth = useAuthStore();

  const leaderboard = ref<LeaderboardUser[]>([]);
  const monthlyHistory = ref<MonthlyChampion[]>([]);

  const fetchLeaderboard = async () => {
    loading.value = true;
    error.value = null;

    try {
      const { data: submissions, error: subError } = await supabase
        .from('submission_reviews')
        .select('user_id, total_weight, calculated_value, status, created_at')
        .eq('status', 'VERIFIED');

      if (subError) throw subError;

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, nickname, email');

      if (usersError) throw usersError;

      const userMap = new Map();
      users?.forEach(u => {
        userMap.set(u.id, { nickname: u.nickname, email: u.email });
      });

      const userStats = new Map<string, {
        user_id: string;
        nickname: string;
        email: string;
        total_weight: number;
        total_points: number;
        submission_count: number;
      }>();

      submissions?.forEach(sub => {
        const existing = userStats.get(sub.user_id) || {
          user_id: sub.user_id,
          nickname: userMap.get(sub.user_id)?.nickname || 'Unknown',
          email: userMap.get(sub.user_id)?.email || '',
          total_weight: 0,
          total_points: 0,
          submission_count: 0
        };

        existing.total_weight += sub.total_weight || 0;
        existing.total_points += sub.calculated_value || 0;
        existing.submission_count += 1;

        userStats.set(sub.user_id, existing);
      });

      const sortedUsers = Array.from(userStats.values())
        .sort((a, b) => b.total_points - a.total_points)
        .slice(0, 20);

      leaderboard.value = sortedUsers.map((user, index) => ({
        rank: index + 1,
        user_id: user.user_id,
        nickname: user.nickname,
        email: user.email,
        total_weight: user.total_weight,
        carbon_saved: user.total_weight * 0.5,
        total_points: user.total_points,
        submission_count: user.submission_count,
        multiplier: user.total_weight > 100 ? '3x' : user.total_weight > 50 ? '2x' : '1x'
      }));
    } catch (err: any) {
      console.error('[AdminLeaderboard] Error:', err);
      error.value = err.message || 'Failed to fetch leaderboard';
      
      leaderboard.value = generateDemoLeaderboard();
    } finally {
      loading.value = false;
    }
  };

  const fetchMonthlyHistory = async () => {
    loading.value = true;
    error.value = null;

    try {
      const { data, error: historyError } = await supabase
        .from('monthly_champions')
        .select('*')
        .order('archived_at', { ascending: false });

      if (historyError) throw historyError;

      monthlyHistory.value = data || [];
    } catch (err: any) {
      console.error('[AdminLeaderboard] History error:', err);
      monthlyHistory.value = generateDemoHistory();
    } finally {
      loading.value = false;
    }
  };

  const resetLeaderboard = async () => {
    loading.value = true;
    error.value = null;

    try {
      const now = new Date();
      const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });

      const championsToInsert = leaderboard.value.map(user => ({
        user_id: user.user_id,
        nickname: user.nickname,
        email: user.email,
        rank: user.rank,
        total_weight: user.total_weight,
        total_points: user.total_points,
        month: currentMonth.split(' ')[0],
        year: now.getFullYear(),
        archived_at: now.toISOString()
      }));

      if (championsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('monthly_champions')
          .upsert(championsToInsert, { onConflict: 'user_id,month,year' });

        if (insertError) throw insertError;
      }

      await fetchMonthlyHistory();
    } catch (err: any) {
      console.error('[AdminLeaderboard] Reset error:', err);
      error.value = err.message || 'Failed to reset leaderboard';
    } finally {
      loading.value = false;
    }
  };

  const getUserTransactions = async (userId: string) => {
    loading.value = true;
    error.value = null;

    try {
      const { data, error: transError } = await supabase
        .from('submission_reviews')
        .select('id, device_no, total_weight, calculated_value, status, multiplier, created_at')
        .eq('user_id', userId)
        .eq('status', 'VERIFIED')
        .order('created_at', { ascending: false });

      if (transError) throw transError;

      return data || [];
    } catch (err: any) {
      console.error('[AdminLeaderboard] Transactions error:', err);
      return [];
    } finally {
      loading.value = false;
    }
  };

  const generateDemoLeaderboard = (): LeaderboardUser[] => {
    const demoUsers = [
      { user_id: 'user-001', nickname: 'Alice Johnson', email: 'alice@example.com', total_weight: 245.5, total_points: 122.75 },
      { user_id: 'user-002', nickname: 'Bob Smith', email: 'bob@example.com', total_weight: 198.2, total_points: 99.10 },
      { user_id: 'user-003', nickname: 'Carol Williams', email: 'carol@example.com', total_weight: 175.8, total_points: 87.90 },
      { user_id: 'user-004', nickname: 'David Brown', email: 'david@example.com', total_weight: 156.3, total_points: 78.15 },
      { user_id: 'user-005', nickname: 'Eva Martinez', email: 'eva@example.com', total_weight: 142.1, total_points: 71.05 },
      { user_id: 'user-006', nickname: 'Frank Lee', email: 'frank@example.com', total_weight: 128.7, total_points: 64.35 },
      { user_id: 'user-007', nickname: 'Grace Chen', email: 'grace@example.com', total_weight: 115.4, total_points: 57.70 },
      { user_id: 'user-008', nickname: 'Henry Wilson', email: 'henry@example.com', total_weight: 98.9, total_points: 49.45 },
      { user_id: 'user-009', nickname: 'Iris Taylor', email: 'iris@example.com', total_weight: 87.6, total_points: 43.80 },
      { user_id: 'user-010', nickname: 'Jack Anderson', email: 'jack@example.com', total_weight: 76.2, total_points: 38.10 }
    ];

    return demoUsers.map((user, index) => ({
      rank: index + 1,
      user_id: user.user_id,
      nickname: user.nickname,
      email: user.email,
      total_weight: user.total_weight,
      carbon_saved: user.total_weight * 0.5,
      total_points: user.total_points,
      submission_count: Math.floor(Math.random() * 20) + 5,
      multiplier: user.total_weight > 100 ? '3x' : user.total_weight > 50 ? '2x' : '1x'
    }));
  };

  const generateDemoHistory = (): MonthlyChampion[] => {
    return [
      { id: '1', user_id: 'user-001', nickname: 'Alice Johnson', email: 'alice@example.com', rank: 1, total_weight: 245.5, total_points: 122.75, month: 'March', year: 2026, archived_at: '2026-03-31T23:59:59Z' },
      { id: '2', user_id: 'user-002', nickname: 'Bob Smith', email: 'bob@example.com', rank: 2, total_weight: 198.2, total_points: 99.10, month: 'March', year: 2026, archived_at: '2026-03-31T23:59:59Z' },
      { id: '3', user_id: 'user-001', nickname: 'Alice Johnson', email: 'alice@example.com', rank: 1, total_weight: 312.8, total_points: 156.40, month: 'February', year: 2026, archived_at: '2026-02-28T23:59:59Z' },
      { id: '4', user_id: 'user-003', nickname: 'Carol Williams', email: 'carol@example.com', rank: 2, total_weight: 287.5, total_points: 143.75, month: 'February', year: 2026, archived_at: '2026-02-28T23:59:59Z' }
    ];
  };

  return {
    loading,
    error,
    leaderboard,
    monthlyHistory,
    fetchLeaderboard,
    fetchMonthlyHistory,
    resetLeaderboard,
    getUserTransactions,
    generateDemoLeaderboard
  };
}