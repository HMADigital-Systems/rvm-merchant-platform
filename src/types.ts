// Fix: Use 'as const' object instead of enum for erasableSyntaxOnly compatibility
export const WithdrawalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
} as const;

export type WithdrawalStatus = typeof WithdrawalStatus[keyof typeof WithdrawalStatus];

export interface User {
  id: string;
  vendor_user_no: string;
  phone: string;
  lifetime_integral: number;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  phone: string;
  amount: number;
  status: WithdrawalStatus;
  created_at: string;
}

export interface Machine {
  id: string;
  deviceNo: string;
  deviceName?: string;
  address: string;
  isOnline: number;
  status: number;
}

export interface ApiUserSyncResponse {
  code: number;
  data: {
    userNo: string;
    integral: number;
    phone: string;
    isNewUser: number;
  };
}

export interface ApiDisposalRecord {
  id: string;
  deviceNo: string;
  weight: number;
  integral: number;
  rubbishName: string;
  createTime: string;
  imgUrl?: string;
}

export interface ApiPutResponse {
  code: number;
  data: {
    list: ApiDisposalRecord[];
    total: number;
  };
}