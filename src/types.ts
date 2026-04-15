// ==========================================
// 1. MERCHANT & SAAS TYPES (New)
// ==========================================

export interface Merchant {
  id: string;
  name: string;
  currency_symbol: string;
  rate_plastic: number;
  is_active: boolean;
  contact_email?: string;
  created_at: string;
}

export interface MerchantWallet {
  id: string;
  user_id: string;
  merchant_id: string;
  current_balance: number;
  total_earnings: number;
  last_updated_at: string;
}

// ==========================================
// 2. EXISTING ENUMS & TYPES (Updated)
// ==========================================

export const WithdrawalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAID: 'PAID',
  EXTERNAL_SYNC: 'EXTERNAL_SYNC'
} as const;

export type WithdrawalStatus = typeof WithdrawalStatus[keyof typeof WithdrawalStatus];

// ==========================================
// 3. DATABASE INTERFACES
// ==========================================

export type UserStatus = 'ACTIVE' | 'WARNED' | 'BLOCKED' | 'UNDER_REVIEW';

export type UserRole = 'user' | 'investor' | 'collector' | 'admin' | 'SUPER_ADMIN';

export interface User {
  id: string;
  vendor_user_no?: string | null;
  phone: string;
  email?: string | null;
  
  lifetime_integral: number;
  total_weight?: number;
  
  created_at: string;
  updated_at?: string;
  last_active_at?: string;
  
  status?: UserStatus;
  
  nickname?: string | null;
  avatar_url?: string | null;
  card_no?: string | null;
  vendor_internal_id?: string | null;
  last_synced_at?: string | null;
  
  // Investor fields
  role?: UserRole;
  company_name?: string | null;
}

export interface UserProfile {
  nickname?: string;
  phone?: string;
  email?: string;
  avatar_url?: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  merchant_id?: string; // ✅ SaaS: Linked to specific merchant wallet
  amount: number;
  status: WithdrawalStatus;
  created_at: string;
  updated_at: string;
  
  // Payment Details
  bank_name?: string;
  account_number?: string;
  account_holder_name?: string;
  
  // Admin Fields
  admin_note?: string;
  reviewed_by?: string;

  // Joined Data
  users?: UserProfile; 
  merchants?: { name: string }; // ✅ To show which shop paid
}

export interface Machine {
  id: number;
  device_no: string;
  deviceNo?: string;
  
  merchant_id?: string;
  
  name: string;
  address?: string;
  location_name?: string;
  
  // Status
  is_active: boolean;
  zone?: string;
  is_manual_offline: boolean;

  // Rates
  config_bin_1: string;
  config_bin_2: string;
  rate_plastic: number;
  rate_paper: number;
  rate_uco: number;
  
  // Investor fields
  investor_id?: string | null;
  investment_value?: number | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  
  // Joined Data
  merchant?: Merchant; 
}

export interface ViewerMachineAssignment {
  id: string;
  admin_id: string;
  machine_id: number;
  assigned_at: string;
  assigned_by: string | null;
  
  // Joined Data
  machines?: {
    device_no: string;
    name: string;
    address: string;
    zone: string;
  };
}

// Fraud detection constants
export const FRAUD_DETECTION = {
  MAX_ITEM_WEIGHT: 500, // grams
  MAX_DAILY_SUBMISSIONS: 50 // per user per day
} as const;

export type SubmissionReviewStatus = 'Pending' | 'Approved' | 'Flagged' | 'Rejected';

// Legacy status type (used in existing code)
export type SubmissionStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface SubmissionReview {
  id: string;
  vendor_record_id: string;
  
  // Ownership
  user_id: string;
  merchant_id?: string; // SaaS: Which merchant pays for this?
  
  phone: string;
  device_no: string;
  waste_type: string;
  photo_url: string;
  
  // Weights
  api_weight: number;
  theoretical_weight: number;
  warehouse_weight?: number;
  confirmed_weight?: number;
  bin_weight_snapshot?: number;
  
  // Financials
  rate_per_kg: number;
  calculated_value?: number; // ✅ SaaS: Money Value (RM)
  calculated_points?: number; // Legacy: Points
  machine_given_points?: number;
  
  // Status - Updated with fraud detection
  status: 'Pending' | 'Approved' | 'Flagged' | 'Rejected';
  is_suspicious?: boolean;
  fraud_reason?: string;
  submitted_at: string;
  
  // Joined Data
  users?: {
    nickname: string;
    avatar_url: string;
    phone: string | null;
  };
  merchants?: {
    name: string;
    currency_symbol: string;
  };
}

// ==========================================
// 4. API RESPONSE INTERFACES (Keep as is)
// ==========================================

export interface ApiUserSyncResponse {
  code: number;
  msg: string;
  data: {
    userNo: string;
    integral: number;
    phone: string;
    nikeName?: string;  
    name?: string;        
    imgUrl?: string;
    createTime?: string;
    isNewUser?: number;
  };
}

export interface ApiDisposalRecord {
  id: string;
  deviceNo: string;
  deviceName?: string;
  weight: number;
  integral: number;
  rubbishName?: string; 
  createTime: string;
  imgUrl?: string;
  cardNo?: string;      
  username?: string;
  userId?: string;    
}

export interface ApiPutResponse {
  code: number;
  data: {
    list: ApiDisposalRecord[];
    total: number;
    pageNum: number;
    pageSize: number;
  };
}