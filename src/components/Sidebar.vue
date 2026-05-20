<script setup lang="ts">
import { useRoute } from 'vue-router';
import { computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useNotifications, notificationCount, issueCount } from '../composables/useNotifications';
import { 
  LayoutDashboard, Activity, BarChart3, Package, ArrowDownCircle,
  Users, MonitorSmartphone, ShoppingBag, FileText, Truck,
  LifeBuoy, ShieldCheck, Trophy, Shield,
  Percent, Megaphone, AlertCircle,
  Settings, LogOut
} from 'lucide-vue-next';

const route = useRoute();
const auth = useAuthStore();
useNotifications();

const isActive = (path: string) => route.path === path;

const handleLogout = async () => {
  try { await auth.logout(); }
  catch (err) { console.error('Logout failed', err); }
};

const settingsPath = computed(() => {
  if (auth.role === 'SUPER_ADMIN' && !auth.merchantId) return '/super-admin/config';
  return '/settings';
});

// ========================================
// NAVIGATION DATA
// ========================================
interface NavItem {
  label: string;
  icon: any;
  path: string;
  badge?: number;
  newTab?: boolean;
  roles?: string[];
}

interface NavGroup {
  header: string;
  items: NavItem[];
  accent?: boolean; // purple text for PLATFORM OWNER
  roles?: string[];
}

const navGroups = computed(() => {
  // Map paths to page IDs for permission filtering
  const pathToPageId: Record<string, string> = {
    '/submissions': 'submissions',
    '/collections': 'collections',
    '/withdrawals': 'withdrawal',
    '/users': 'users',
    '/machines': 'machines',
    '/shop-orders': 'shop-orders',
    '/reports': 'reports',
    '/cleaning-logs': 'bulk-collection',
  };
  
  const userPerms = auth.pagePermissions || [];
  const isSuperAdmin = auth.role === 'SUPER_ADMIN';
  
  const canAccess = (path: string) => {
    // SUPER_ADMIN can access everything
    if (isSuperAdmin) return true;
    // Check page permissions
    const pageId = pathToPageId[path];
    if (!pageId) return true; // non-Operations pages always shown
    return userPerms.includes(pageId);
  };
  
  const filterItems = (items: any[]) => items.filter(item => canAccess(item.path));

  return [
    {
      header: 'DASHBOARD',
      items: [
        { label: 'Overview', icon: LayoutDashboard, path: '/' },
        { label: 'Live Ops', icon: Activity, path: '/command-center', newTab: true },
        { label: 'Analytics', icon: BarChart3, path: '/big-data' },
      ]
    },

    {
      header: 'OPERATIONS',
      items: filterItems([
        { label: 'Submissions', icon: Package, path: '/submissions' },
        { label: 'Collections', icon: Truck, path: '/collections' },
        { label: 'Withdrawal', icon: ArrowDownCircle, path: '/withdrawals' },
        { label: 'Users', icon: Users, path: '/users' },
        { label: 'Machines', icon: MonitorSmartphone, path: '/machines' },
        { label: 'Shop Orders', icon: ShoppingBag, path: '/shop-orders' },
        { label: 'Reports', icon: FileText, path: '/reports' },
        { label: 'Bulk Collection', icon: LifeBuoy, path: '/cleaning-logs' },
      ])
    },

    {
      header: 'ADMIN',
      items: [
        { label: 'Customer Support', icon: LifeBuoy, path: '/support' },
        { label: 'AI Verification', icon: ShieldCheck, path: '/ai-verification' },
        { label: 'Leaderboard', icon: Trophy, path: '/admin/leaderboard', roles: ['SUPER_ADMIN'] },
        { label: 'Agencies', icon: Shield, path: '/admins' },
      ]
    },

    // ──────────────────────────────
    // GROUP 4: PLATFORM OWNER (SUPER_ADMIN only)
    // ──────────────────────────────
    {
      header: 'PLATFORM OWNER',
      accent: true,
      roles: ['SUPER_ADMIN'],
      items: [
      { label: 'Commission', icon: Percent, path: '/commission' },
      { label: 'Advertising', icon: Megaphone, path: '/platform/advertising' },
      {
        label: 'Issues',
        icon: AlertCircle,
        path: '/super-admin/issues',
        badge: issueCount.value || (1 as number)
      },
      ]
    }
  ];
});
</script>

<template>
  <aside class="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-10">
    <!-- Logo -->
    <div class="h-16 flex items-center px-8 border-b border-gray-100">
      <div class="text-xl font-bold text-blue-600 flex items-center gap-2">
        <MonitorSmartphone />
        <span>RVM Admin</span>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 p-4 overflow-y-auto space-y-6">

      <template v-for="group in navGroups" :key="group.header">
        <!-- Skip groups with role restrictions user doesn't have -->
        <div v-if="!group.roles || group.roles.includes(auth.role)">
          <!-- Section Header -->
          <p
            class="px-4 text-xs font-semibold uppercase tracking-wider mb-2"
            :class="group.accent ? 'text-purple-600' : 'text-gray-400'"
          >
            {{ group.header }}
          </p>

          <!-- Items -->
          <template v-for="item in group.items" :key="item.label">
            <!-- Conditional: skip items with role restrictions -->
            <template v-if="!item.roles || item.roles.includes(auth.role)">
              <!-- New tab link -->
              <a
                v-if="item.newTab"
                :href="item.path"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                <component :is="item.icon" :size="20" />
                <span>{{ item.label }}</span>
              </a>

              <!-- Normal router link -->
              <RouterLink
                v-else
                :to="item.path"
                class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors"
                :class="isActive(item.path)
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
              >
                <component :is="item.icon" :size="20" />
                <span>{{ item.label }}</span>
                <!-- Badge -->
                <span
                  v-if="item.badge"
                  class="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full"
                >
                  {{ item.badge > 99 ? '99+' : item.badge }}
                </span>
              </RouterLink>
            </template>
          </template>
        </div>
      </template>

    </nav>

    <!-- Footer: Settings + Logout -->
    <div class="p-4 border-t border-gray-100 space-y-2">
      <RouterLink
        :to="settingsPath"
        class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors"
        :class="isActive(settingsPath) ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
      >
        <Settings :size="20" />
        Settings
      </RouterLink>

      <button
        @click="handleLogout"
        class="flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg w-full transition-colors cursor-pointer"
      >
        <LogOut :size="20" />
        Logout
      </button>
    </div>
  </aside>
</template>
