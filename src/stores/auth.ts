import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useRouter } from 'vue-router';
import type { User, Session } from '@supabase/supabase-js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const session = ref<Session | null>(null);
  const loading = ref(true);
  
  // 🔥 NEW: Store the SaaS Context
  const role = ref<string | null>(null);
  const merchantId = ref<string | null>(null); // If null, they are Super Admin

  const router = useRouter();

  // 1. Initialize: Check session & Load Profile
  async function initializeAuth() {

    if (window.location.pathname === '/login') {
        loading.value = false;
        return; 
    }

    loading.value = true;
    const { data } = await supabase.auth.getSession();
    
    if (data.session) {
      const email = data.session.user.email;
      if (email) {
        // Load the profile (Role + Merchant ID)
        await loadAdminProfile(email);
        session.value = data.session;
        user.value = data.session.user;
      } else {
        await logout();
      }
    }
    loading.value = false;
  }

  // 2. Helper: Fetch Profile from DB
  async function loadAdminProfile(email: string) {
    const { data } = await supabase // <--- Removed 'error'
      .from('app_admins')
      .select('role, merchant_id')
      .eq('email', email)
      .single();
    
    if (data) {
        role.value = data.role;
        merchantId.value = data.merchant_id;
        console.log(`👤 Login Profile: ${data.role} | Merchant: ${data.merchant_id || 'Global'}`);
        return true;
    }
    return false;
  }

  // 3. Login
  async function login(email: string, password: string) {
    // A. Check Whitelist & Load Profile First
    const isValid = await loadAdminProfile(email);
    if (!isValid) throw new Error("Access Denied: You are not an administrator.");

    // B. Perform Login
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    session.value = data.session;
    user.value = data.user;
    router.push('/');
  }

  // 4. Register
  async function register(email: string, password: string) {
    const isValid = await loadAdminProfile(email);
    if (!isValid) throw new Error("Access Denied: Email not invited.");

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    
    if (data.session) {
      session.value = data.session;
      user.value = data.user;
      router.push('/');
    } else {
        alert("Account created! Please check your email.");
    }
  }

  async function logout() {
    try {
      // 1. Try to tell Supabase we are leaving (Best effort)
      const { error } = await supabase.auth.signOut();
      if (error) console.warn("Supabase logout error (ignoring):", error.message);
    } catch (err) {
      console.warn("Logout network error (ignoring):", err);
    } finally {
      // 2. NUCLEAR CLEANUP: Force wipe everything locally
      console.log("Cleaning up local session...");
      
      // A. Reset Store State
      user.value = null;
      session.value = null;
      role.value = null;
      merchantId.value = null;

      // B. Wipe Local Storage (This removes the persisted token)
      // This ensures that refreshing the page won't auto-login again
      localStorage.clear(); 
      // OR if you want to be specific: 
      // const projectRef = 'piwthttkmkndflmqvxov'; // Your Supabase Ref from URL
      // localStorage.removeItem(`sb-${projectRef}-auth-token`);

      // C. Force Redirect
      console.log("Redirecting to login...");
      router.replace('/login'); // .replace() prevents 'Back' button from returning
    }
  }

  return { user, session, role, merchantId, loading, initializeAuth, login, register, logout };
});