import type { User, Withdrawal, Machine, ApiDisposalRecord, ApiUserSyncResponse } from '../types';
import { WithdrawalStatus } from '../types'; // Keep Enum import standard if used as value
import md5 from 'blueimp-md5';

// --- ENVIRONMENT & SECURITY ---

const getEnv = (key: string, fallback: string) => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    // @ts-ignore
    return import.meta.env[key];
  }
  return fallback;
};

const MERCHANT_NO = getEnv('VITE_MERCHANT_NO', 'TEST_MERCHANT_001');
const API_SECRET = getEnv('VITE_API_SECRET', 'TEST_SECRET_KEY_123');

const generateHeaders = () => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawString = `${MERCHANT_NO}${API_SECRET}${timestamp}`;
  const sign = md5(rawString);

  return {
    'Merchant-No': MERCHANT_NO,
    'Sign': sign,
    'Timestamp': timestamp
  };
};

// --- MOCK DATA ---
const mockWithdrawals: Withdrawal[] = [
  { id: 'w1', user_id: 'u1', phone: '18675554683', amount: 50, status: WithdrawalStatus.PENDING, created_at: '2023-10-25T10:00:00Z' },
  { id: 'w2', user_id: 'u2', phone: '13800138000', amount: 100, status: WithdrawalStatus.APPROVED, created_at: '2023-10-24T14:30:00Z' },
  { id: 'w3', user_id: 'u1', phone: '18675554683', amount: 20, status: WithdrawalStatus.APPROVED, created_at: '2023-10-20T09:15:00Z' },
  { id: 'w4', user_id: 'u3', phone: '13912345678', amount: 200, status: WithdrawalStatus.PENDING, created_at: '2023-10-26T11:20:00Z' },
];

const mockUsers: User[] = [
  { id: 'u1', vendor_user_no: '365823', phone: '18675554683', lifetime_integral: 500, created_at: '2023-01-01T00:00:00Z' },
  { id: 'u2', vendor_user_no: '365824', phone: '13800138000', lifetime_integral: 1200, created_at: '2023-02-15T00:00:00Z' },
  { id: 'u3', vendor_user_no: '365825', phone: '13912345678', lifetime_integral: 300, created_at: '2023-03-20T00:00:00Z' },
];

const mockMachines: Machine[] = [
  { id: 'm1', deviceNo: '040201000001', address: 'Central Park Station A', isOnline: 1, status: 1 },
  { id: 'm2', deviceNo: '040201000002', address: 'Downtown Mall', isOnline: 1, status: 1 },
  { id: 'm3', deviceNo: '040201000003', address: 'Residential Area B', isOnline: 0, status: 3 },
];

const mockApiDisposalHistory: ApiDisposalRecord[] = [
  { id: 'd1', deviceNo: '040201000001', weight: 1.5, integral: 15, rubbishName: 'Plastic', createTime: '2023-10-25 10:30:00' },
  { id: 'd2', deviceNo: '040201000001', weight: 0.5, integral: 5, rubbishName: 'Metal', createTime: '2023-10-25 10:35:00' },
  { id: 'd3', deviceNo: '040201000002', weight: 2.0, integral: 20, rubbishName: 'Paper', createTime: '2023-10-24 14:00:00' },
];

// --- API SERVICES ---

export const supabaseService = {
  getWithdrawals: async (): Promise<Withdrawal[]> => {
    return new Promise((resolve) => setTimeout(() => resolve([...mockWithdrawals]), 500));
  },

  getUsers: async (): Promise<User[]> => {
    return new Promise((resolve) => setTimeout(() => resolve([...mockUsers]), 500));
  },

  getUserById: async (id: string): Promise<User | undefined> => {
    return new Promise((resolve) => setTimeout(() => resolve(mockUsers.find(u => u.id === id)), 300));
  },

  getTotalPointsDistributed: async (): Promise<number> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const total = mockUsers.reduce((sum, user) => sum + user.lifetime_integral, 0);
        resolve(total);
      }, 400);
    });
  },

  // ✅ FIXED FUNCTION
  updateWithdrawalStatus: async (id: string, status: WithdrawalStatus): Promise<void> => {
    // Use .find() instead of .findIndex() to safely get the object
    const withdrawal = mockWithdrawals.find(w => w.id === id);
    
    if (withdrawal) {
      withdrawal.status = status;
    }
    return Promise.resolve();
  },

  getUserWithdrawalHistory: async (userId: string): Promise<Withdrawal[]> => {
    return Promise.resolve(mockWithdrawals.filter(w => w.user_id === userId));
  }
};

export const hardwareApiService = {
  getMachines: async (): Promise<Machine[]> => {
    // Log headers to avoid 'unused variable' error
    const headers = generateHeaders();
    console.log('[Mock] Fetching machines with headers:', headers);
    return new Promise((resolve) => setTimeout(() => resolve([...mockMachines]), 600));
  },

  syncUserAccount: async (phone: string): Promise<ApiUserSyncResponse> => {
    const headers = generateHeaders();
    console.log('[Mock] Syncing user with headers:', headers);

    return new Promise((resolve) => {
      setTimeout(() => {
        const user = mockUsers.find(u => u.phone === phone);
        const currentIntegral = user ? user.lifetime_integral + 15 : 0; 
        
        resolve({
          code: 200,
          data: {
            userNo: user?.vendor_user_no || '0',
            integral: currentIntegral,
            phone: phone,
            isNewUser: 0
          }
        });
      }, 800);
    });
  },

  getDisposalRecords: async (phone: string): Promise<ApiDisposalRecord[]> => {
    // Log phone to avoid 'unused variable' error
    console.log('[Mock] Fetching records for phone:', phone);
    return new Promise((resolve) => setTimeout(() => resolve([...mockApiDisposalHistory]), 700));
  }
};