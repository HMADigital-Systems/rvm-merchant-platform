import { createRouter, createWebHistory } from 'vue-router';
import { supabase } from '../services/supabase'; // Import Supabase directly for speed


// Import your views
import Dashboard from '../views/Dashboard.vue';
import Withdrawals from '../views/Withdrawal.vue';
import Users from '../views/Users.vue';
import UserDetail from '../views/UserDetail.vue';
import MachineStatus from '../views/MachineStatus.vue';
import Login from '../views/Login.vue';
import AdminManager from '../views/AdminManager.vue';
import MerchantSettings from '../views/MerchantSettings.vue';

const MerchantsManager = () => import('../views/SuperAdmin/Merchants.vue');
const ManageClientSettings = () => import('../views/SuperAdmin/ManageClientSettings.vue');

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { 
      path: '/login', 
      name: 'login', 
      component: Login,
      meta: { hideSidebar: true, requiresAuth: false } //  Public Page
    },
    {
      path: '/',
      name: 'dashboard',
      component: Dashboard,
      meta: { requiresAuth: true } // 🔒 Protected
    },
    {
      path: '/submissions',
      name: 'submissions',
      component: () => import('../views/Submissions.vue'),
      meta: { requiresAuth: true } // 🔒 Protected
    },
    {
      path: '/withdrawals',
      name: 'withdrawals',
      component: Withdrawals,
      meta: { requiresAuth: true } // 🔒 Protected
    },
    {
      path: '/users',
      name: 'users',
      component: Users,
      meta: { requiresAuth: true } // 🔒 Protected
    },
    {
      path: '/users/:id',
      name: 'userDetail',
      component: UserDetail,
      meta: { requiresAuth: true } // 🔒 Protected
    },
    {
      path: '/machines',
      name: 'machines',
      component: MachineStatus,
      meta: { requiresAuth: true } // 🔒 Protected
    },
    { 
      path: '/admins', 
      component: AdminManager,
      meta: { requiresAuth: true } // 🔒 Protected
    },
    {
      path: '/cleaning-logs',
      name: 'CleaningLogs',
      component: () => import('../views/CleaningLogs.vue'),
      meta: { requiresAuth: true } // 🔒 Protected
    },
    {
    path: '/settings',
    name: 'Settings',
    component: MerchantSettings,
    meta: { requiresAuth: true }
    },
    // === NEW SUPER ADMIN ROUTES ===
    {
      path: '/super-admin/merchants',
      name: 'SuperAdminMerchants',
      component: MerchantsManager,
      meta: { requiresAuth: true, requiresSuperAdmin: true } //  New Meta Tag
    },
    {
      path: '/super-admin/config', // New path
      name: 'SuperAdminConfig',
      component: ManageClientSettings,
      meta: { requiresAuth: true, requiresSuperAdmin: true }
    },
  ]
});

// ------------------------------------------------------------------
//  THE GATEKEEPER (Navigation Guard)
// ------------------------------------------------------------------
router.beforeEach(async (to, _from, next) => {
  const { data: { session } } = await supabase.auth.getSession();
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const requiresSuperAdmin = to.matched.some(record => record.meta.requiresSuperAdmin); // Check tag

  if (requiresAuth && !session) {
    next({ name: 'login' });
    return;
  }

  if (session) {
    // Check Admin Role
    const { data: admin } = await supabase
      .from('app_admins')
      .select('role')
      .eq('email', session.user.email!)
      .single();

    if (!admin) {
      // Not in whitelist -> Kick out
      await supabase.auth.signOut();
      next({ name: 'login' });
      return;
    }

    // 🔥 NEW: Super Admin Check
    if (requiresSuperAdmin && admin.role !== 'SUPER_ADMIN') {
      alert("⛔ Access Denied: Super Admin Only");
      next({ name: 'dashboard' }); // Send back to safety
      return;
    }
  }

  next();
});

export default router;