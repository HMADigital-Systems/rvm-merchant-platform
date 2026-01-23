import axios from "axios";
import type { Machine } from "../types";

// 1. Define Proxy URLs (Priority List)
// In DEV: Try Localhost first, then fallback to Live.
// In PROD: Use relative path (handles domain automatically).
const PROXY_URLS = import.meta.env.DEV 
  ? ['http://localhost:3000/api/proxy', 'https://rvm-merchant-platform.vercel.app/api/proxy'] 
  : ['/api/proxy'];

// FIXED: Support Failover Loop
async function callApi<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', data: any = {}): Promise<T> {
  const payload = {
    endpoint,
    method,
    [method === 'GET' ? 'params' : 'body']: data
  };

  // Loop through available backends
  for (const url of PROXY_URLS) {
    try {
      const res = await axios.post(url, payload);
      return res.data as T; 
    } catch (error: any) {
      // If this is the LAST url in the list, throw the error (all failed)
      if (url === PROXY_URLS[PROXY_URLS.length - 1]) {
        console.error(`❌ API Error [${endpoint}] on all backends:`, error.message);
        throw error;
      }
      // Otherwise, warn and try the next one
      console.warn(`⚠️ Failed to fetch from ${url}, switching to next backend...`);
    }
  }
  throw new Error("Network Error");
}

// 3. Get Nearby RVMs
// ... (The rest of your file remains exactly the same) ...
export async function getNearbyRVMs(latitude: number = 3.14, longitude: number = 101.68): Promise<Machine[]> {
  try {
    const res = await callApi<any>('/api/open/video/v2/nearby', 'GET', { latitude, longitude });
    
    if (res && res.code === 200 && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  } catch (error) {
    console.error("Failed to fetch machine list", error);
    return [];
  }
}

// 4. Sync User / Get User Info
// Improved to handle both "Fetching" (just phone) and "Updating" (phone + data)
export async function syncUserAccount(
  phone: string, 
  details?: { nikeName?: string; avatarUrl?: string }
): Promise<any> {
  try {
    // 1. Construct the base payload (always required)
    const payload: any = { phone };

    // 2. Only add optional fields if they exist. 
    // This prevents overwriting existing data with empty strings.
    if (details?.nikeName) {
      payload.nikeName = details.nikeName; // Note: API uses typo 'nikeName'
    }
    
    if (details?.avatarUrl) {
      payload.avatarUrl = details.avatarUrl;
    }

    const res = await callApi<any>('/api/open/v1/user/account/sync', 'POST', payload);
    
    // We return res.data directly so components can access .integral immediately
    if (res && res.code === 200 && res.data) {
      return res.data; 
    }
    
    throw new Error(res.msg || "Invalid response from API");
  } catch (error) {
    console.error("Failed to sync user account", error);
    throw error;
  }
}

// 5. Get Individual Machine Status
// Used by the Store to check status one-by-one (Sequential Fetch)
export async function getMachineConfig(deviceNo: string): Promise<any> {
  try {
    const res = await callApi<any>('/api/open/v1/device/position', 'GET', { deviceNo });
    return res;
  } catch (error) {
    console.error(`Failed to fetch config for ${deviceNo}`, error);
    return null;
  }
}

// ✅ 6. Get User Disposal Records
// Used in User Details to show Recycling History
export async function getUserRecords(phone: string, pageNum = 1, pageSize = 20): Promise<any[]> {
  try {
    const res = await callApi<any>('/api/open/v1/put', 'GET', { 
        phone, 
        pageNum, 
        pageSize 
    });
    
    // The API wraps the list inside data.list
    if (res && res.code === 200 && res.data && Array.isArray(res.data.list)) {
      return res.data.list;
    }
    return [];
  } catch (error) {
    console.error("Failed to fetch user recycling records", error);
    return [];
  }
}