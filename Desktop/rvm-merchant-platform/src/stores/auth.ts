import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useRouter } from 'vue-router';
import type { User, Session } from '@supabase/supabase-js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const session = ref<Session | null>(null);
  const loading = ref(true);
  
  // SaaS Context
  const role = ref<string | null>(null);
  const merchantId = ref<string | null>(null); 

  const router = useRouter();

  // 1. Initialize: Check session & Load Profile
  async function initializeAuth() {
    if (window.location.pathname === '/login') {
        loading.value = false;
        return; 
    }

    loading.value = true;
    console.log('🔐 Initializing auth...');
    const { data } = await supabase.auth.getSession();
    
    console.log('📋 Session data:', data.session ? 'Found' : 'None');
    
    if (data.session) {
      const email = data.session.user.email;
      console.log('👤 User email from session:', email);
      
      if (email) {
        // We are already logged in, so we can safely Read the profile
        const success = await fetchAdminProfile(email);
        console.log('✅ Profile fetch success:', success);
        
        if (success) {
            session.value = data.session;
            user.value = data.session.user;
        } else {
            console.warn('⚠️ Profile not found, logging out');
            await logout(); // Profile missing or deleted
        }
      } else {
        console.warn('⚠️ No email in session');
        await logout();
      }
    }
    loading.value = false;
  }

  // 2. Helper: Check Whitelist (SECURE RPC)
  // Uses the SQL function we created to bypass RLS safely for anonymous users
  async function checkWhitelist(email: string): Promise<boolean> {
    console.log('🔍 Checking whitelist for:', email);
    
    // Use case-insensitive comparison
    const { data, error } = await supabase.rpc('check_admin_whitelist', { 
        check_email: email.toLowerCase()
    });
    
    if (error) {
        console.error("❌ Whitelist check failed:", error);
        return false;
    }
    console.log('✅ Whitelist check result:', data);
    return !!data;
  }

  // 3. Helper: Fetch Profile (REQUIRES AUTH)
  // Only call this AFTER logging in
  async function fetchAdminProfile(email: string) {
    console.log('🔍 Fetching admin profile for:', email);
    
    try {
        // Try with single() first - more explicit
        const { data, error } = await supabase
          .from('app_admins')
          .select('role, merchant_id')
          .ilike('email', email)  // Case-insensitive match
          .single();
        
        console.log('📊 Admin profile query result:', { data, error });
        
        if (error) {
            // Handle 406/PGRST116 error - no matching record
            if (error.code === '406' || error.code === 'PGRST116' || error.message.includes('0 rows')) {
                console.error('❌ No matching admin record - trying case-sensitive fallback...');
                
                // Fallback: Try with exact case match
                const { data: fallbackData, error: fallbackError } = await supabase
                  .from('app_admins')
                  .select('role, merchant_id')
                  .eq('email', email);
                
                console.log('📊 Fallback query result:', { fallbackData, fallbackError });
                
                if (fallbackError) {
                    console.error('❌ Fallback also failed:', fallbackError);
                    return false;
                }
                
                if (!fallbackData || fallbackData.length === 0) {
                    console.warn('⚠️ No admin record found');
                    return false;
                }
                
                const fallbackAdmin = fallbackData[0];
                if (!fallbackAdmin) {
                    console.warn('⚠️ Fallback admin data is undefined');
                    return false;
                }
                
                role.value = fallbackAdmin.role;
                merchantId.value = fallbackAdmin.merchant_id;
                console.log(`👤 Login Profile: ${fallbackAdmin.role}`);
                return true;
            }
            console.error('❌ Error fetching admin profile:', error);
            return false;
        }
        
        if (!data) {
            console.warn('⚠️ No admin data returned');
            return false;
        }
        
        role.value = data.role;
        merchantId.value = data.merchant_id;
        console.log(`👤 Login Profile: ${data.role} | Merchant: ${data.merchant_id || 'Global'}`);
        return true;
    } catch (err: any) {
        console.error('❌ Exception in fetchAdminProfile:', err);
        return false;
    }
  }

  // 4. Login
  async function login(email: string, password: string) {
    // A. Check Whitelist via RPC (Safe for anonymous)
    const isAllowed = await checkWhitelist(email);
    if (!isAllowed) throw new Error("Access Denied: You are not an administrator.");

    // B. Perform Login
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // C. Load Profile (Now that we have a session, RLS allows this)
    if (data.session && data.user?.email) {
        session.value = data.session;
        user.value = data.user;
        await fetchAdminProfile(data.user.email);
        router.push('/');
    }
  }

  // 5. Register
  async function register(email: string, password: string) {
    // A. Check Whitelist via RPC
    const isAllowed = await checkWhitelist(email);
    if (!isAllowed) throw new Error("Access Denied: Email not invited.");

    // B. Create Account
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    
    // C. Handle Auto-Login
    if (data.session && data.user?.email) {
      session.value = data.session;
      user.value = data.user;
      await fetchAdminProfile(data.user.email);
      router.push('/');
    } else {
        alert("Account created! Please check your email.");
    }
  }

  async function logout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) console.warn("Supabase logout error (ignoring):", error.message);
    } catch (err) {
      console.warn("Logout network error (ignoring):", err);
    } finally {
      console.log("Cleaning up local session...");
      
      // Reset Store
      user.value = null;
      session.value = null;
      role.value = null;
      merchantId.value = null;

      // Wipe Storage
      localStorage.clear(); 

      console.log("Redirecting to login...");
      router.replace('/login');
    }
  }

  return { user, session, role, merchantId, loading, initializeAuth, login, register, logout };
});