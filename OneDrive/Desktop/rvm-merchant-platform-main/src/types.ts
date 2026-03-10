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

export type SubmissionStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

// ==========================================
// 3. DATABASE INTERFACES
// ==========================================

export interface User {
  id: string;
  vendor_user_no?: string | null;
  phone: string;
  email?: string | null;
  
  // Global stats (optional, as specific data is now in MerchantWallet)
  lifetime_integral: number;
  total_weight?: number;
  
  created_at: string;
  
  // Hybrid Sync Fields
  nickname?: string | null;
  avatar_url?: string | null;
  card_no?: string | null;
  vendor_internal_id?: string | null;
  last_synced_at?: string | null;
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
  id: number; // Changed to number to match BigInt in DB, or keep string if using string ID
  device_no: string; // Standardized to snake_case matches DB (check your DB column name)
  deviceNo?: string; // Legacy support for API mapping
  
  merchant_id?: string; // SaaS: Who owns this machine?
  
  name: string;      // Replaces deviceName
  address?: string;
  location_name?: string;
  
  // Status
  is_active: boolean;
  zone?: string;
  is_manual_offline: boolean;

  // NEW: Rates are now here (Source of Truth)
  config_bin_1: string;
  config_bin_2: string;
  rate_plastic: number;
  rate_paper: number;
  rate_uco: number;
  
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
  
  status: SubmissionStatus;
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
// 5. ADMIN ROLES
// ==========================================

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'VIEWER' | 'COLLECTOR' | 'AGENT';

export const ADMIN_ROLES: { value: AdminRole; label: string; description: string }[] = [
  { value: 'VIEWER', label: 'Viewer', description: 'Read Only access' },
  { value: 'COLLECTOR', label: 'Collector', description: 'Can manage collections and submissions' },
  { value: 'AGENT', label: 'Agent', description: 'Field agent with limited permissions' },
  { value: 'EDITOR', label: 'Editor', description: 'Can approve submissions' },
  { value: 'ADMIN', label: 'Admin', description: 'Merchant admin access' },
  { value: 'SUPER_ADMIN', label: 'Super Admin', description: 'Full platform access' },
];

// ==========================================
// 6. API RESPONSE INTERFACES
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

// ==========================================
// 7. MACHINE REPORTS (Critical Alerts)
// ==========================================

export type ReportType = 'MAINTENANCE' | 'BIN_FULL' | 'PRINTER_JAM' | 'NETWORK_ISSUE' | 'OTHER';
export type ReportSeverity = 'critical' | 'warning' | 'info';
export type ReportStatus = 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

export interface MachineReport {
  id: string;
  machine_id: number;
  device_no: string;
  merchant_id: string | null;
  report_type: ReportType;
  severity: ReportSeverity;
  description: string;
  status: ReportStatus;
  reported_by_admin_id: string | null;
  reported_by_name: string | null;
  assigned_to_admin_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  
  // Joined Data
  machines?: {
    name: string;
    address: string;
  };
}