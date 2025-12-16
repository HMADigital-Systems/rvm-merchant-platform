import axios from "axios";
import type { Machine, ApiUserSyncResponse } from "../types"; // Fix: type-only import

interface ProxyResponse<T> {
  code: number;
  msg?: string;
  data: T;
}

const PROXY_URL = '/api/proxy';

async function callApi<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', data: any = {}): Promise<ProxyResponse<T>> {
  const payload = { 
    endpoint, 
    method, 
    [method === 'GET' ? 'params' : 'body']: data 
  };
  
  const response = await axios.post(PROXY_URL, payload);
  return response.data;
}

// Fix: Renamed to getNearbyRVMs to match Dashboard imports
export async function getNearbyRVMs(latitude: number = 3.14, longitude: number = 101.68): Promise<Machine[]> {
  try {
    const res = await callApi<Machine[]>('/api/open/video/v2/nearby', 'GET', { latitude, longitude });
    
    // The proxy wrapper returns ProxyResponse<Machine[]>, but sometimes the API structure varies.
    // Assuming callApi returns { code: 200, data: [...] }
    if (res && res.code === 200 && Array.isArray(res.data)) {
      return res.data;
    }
    
    console.warn("Proxy returned invalid data. Using fallback.");
    return [
      { id: 'm1', deviceNo: '040201000001', deviceName: 'KLCC Mall Unit', address: 'Suria KLCC, Kuala Lumpur', isOnline: 1, status: 1 },
      { id: 'm2', deviceNo: '040201000002', deviceName: 'Pavilion Entrance', address: 'Pavilion, Bukit Bintang', isOnline: 1, status: 0 },
    ];
  } catch (error) {
    console.error("Failed to fetch machine list via proxy", error);
    return [];
  }
}

export async function syncUserAccount(phone: string): Promise<ApiUserSyncResponse> {
  try {
    const res = await callApi<any>('/api/open/v1/user/account/sync', 'POST', { phone });
    
    if (res && res.code === 200 && res.data) {
      return res as unknown as ApiUserSyncResponse;
    }
    
    throw new Error(res.msg || "Invalid response from API");
  } catch (error) {
    console.error("Failed to sync user account via proxy", error);
    throw error;
  }
}