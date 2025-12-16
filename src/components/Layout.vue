<script setup lang="ts">
import { useRoute, RouterLink } from 'vue-router';
import { LayoutDashboard, Wallet, Users, ChevronRight, MonitorSmartphone } from 'lucide-vue-next';

const route = useRoute();

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/machines', label: 'Machine Status', icon: MonitorSmartphone },
  { path: '/withdrawals', label: 'Withdrawals', icon: Wallet },
  { path: '/users', label: 'Users', icon: Users },
];

const isActive = (path: string) => {
  return route.path === path || (path !== '/' && route.path.startsWith(path));
};

const getPageTitle = () => {
  const item = navItems.find(i => isActive(i.path));
  return item ? item.label : 'Overview';
};
</script>

<template>
  <div class="flex h-screen bg-gray-50 font-sans">
    <!-- Sidebar -->
    <aside class="w-72 bg-slate-900 text-slate-300 shadow-2xl flex flex-col transition-all duration-300">
      <div class="p-8 border-b border-slate-800">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-green-900/50">E</div>
          <div>
            <h1 class="text-xl font-bold tracking-tight text-white">EcoReward</h1>
            <p className="text-xs text-slate-500 font-medium">Admin Panel</p>
          </div>
        </div>
      </div>
      
      <nav class="flex-1 px-4 py-6 space-y-1">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group"
          :class="isActive(item.path) ? 'bg-green-600 text-white shadow-md shadow-green-900/20' : 'hover:bg-slate-800 hover:text-white'"
        >
          <div class="flex items-center space-x-3">
            <span :class="isActive(item.path) ? 'text-white' : 'text-slate-400 group-hover:text-white'">
              <component :is="item.icon" :size="20" />
            </span>
            <span class="font-medium">{{ item.label }}</span>
          </div>
          <ChevronRight v-if="isActive(item.path)" :size="16" class="text-green-200" />
        </RouterLink>
      </nav>
      
      <div class="p-6 border-t border-slate-800 bg-slate-950/30">
        <div class="flex items-center space-x-3">
          <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <div class="text-xs font-mono text-slate-500">API: v2.1 Connected</div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col h-screen overflow-hidden">
      <header class="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8 shadow-sm z-10">
        <h2 class="text-xl font-semibold text-gray-800 tracking-tight">
          {{ getPageTitle() }}
        </h2>
        <div class="flex items-center space-x-4">
          <div class="text-right hidden sm:block">
            <div class="text-sm font-medium text-gray-900">Administrator</div>
            <div class="text-xs text-gray-500">Super User</div>
          </div>
          <div class="h-10 w-10 rounded-full bg-gradient-to-tr from-green-100 to-green-200 flex items-center justify-center text-green-700 font-bold border-2 border-white shadow-md">
            A
          </div>
        </div>
      </header>
      
      <div class="flex-1 overflow-y-auto bg-gray-50 p-8">
        <div class="max-w-7xl mx-auto">
          <slot></slot>
        </div>
      </div>
    </main>
  </div>
</template>