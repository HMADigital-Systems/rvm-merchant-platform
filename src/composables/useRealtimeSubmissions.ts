import { ref, onMounted, onUnmounted } from 'vue';

export interface SubmissionEvent {
  id?: string;
  username: string;
  machine_id: string;
  material_type: string;
  weight: number;
  user_id?: string;
  created_at: string;
}

const latestSubmissions = ref<SubmissionEvent[]>([]);
let pollInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

export function useRealtimeSubmissions() {
  
  const fetchLatest = async (limit = 10) => {
    if (isPolling) return;
    
    isPolling = true;
    try {
      const response = await fetch(`/api/realtime?action=subscribe&limit=${limit}`);
      const result = await response.json();
      
      if (result.success && result.events) {
        latestSubmissions.value = result.events;
      }
    } catch (error) {
      console.error('Failed to fetch realtime events:', error);
    } finally {
      isPolling = false;
    }
  };

  const startPolling = (intervalMs = 5000) => {
    if (pollInterval) return; // Already polling
    
    fetchLatest(); // Initial fetch
    pollInterval = setInterval(fetchLatest, intervalMs);
  };

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  // Broadcast a new submission event
  const broadcastSubmission = async (data: {
    username?: string;
    machine_id: string;
    material_type?: string;
    weight: number;
    user_id?: string;
  }) => {
    try {
      const response = await fetch('/api/realtime?action=broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Failed to broadcast:', error);
      return false;
    }
  };

  onUnmounted(() => {
    stopPolling();
  });

  return {
    latestSubmissions,
    fetchLatest,
    startPolling,
    stopPolling,
    broadcastSubmission
  };
}