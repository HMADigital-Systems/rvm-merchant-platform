<script setup lang="ts">
import { ref } from 'vue'; // 1. Import ref
import { useRoute } from 'vue-router';
import { watch } from 'vue';
import { useTabsStore } from '../stores/tabs';
import { useAuthStore } from '../stores/auth';
import { RefreshCw } from 'lucide-vue-next'; // 2. Import Refresh Icon
import Sidebar from './Sidebar.vue';
import TabsBar from './TabsBar.vue';

const route = useRoute();
const tabsStore = useTabsStore();
const auth = useAuthStore();

// 3. Refresh Logic State
const refreshKey = ref(0);
const isRefreshing = ref(false);

const handleRefresh = () => {
  isRefreshing.value = true;
  refreshKey.value += 1; // Increment key to force re-render
  
  // Stop spinning animation after 1 second
  setTimeout(() => {
    isRefreshing.value = false;
  }, 1000);
};

// Automatically add tab when route changes
watch(
  () => route.path,
  () => {
    tabsStore.addTab(route);
  },
  { immediate: true }
);

const getPageTitle = () => {
  return (route.meta?.title as string) || route.name?.toString() || 'Dashboard';
};
</script>

<template>
  <div class="flex h-screen bg-gray-50 font-sans overflow-hidden">
    
    <div class="fixed inset-y-0 left-0 z-30 w-64 bg-white transition-all duration-300">
      <Sidebar />
    </div>

    <main class="flex-1 flex flex-col h-screen ml-64 relative bg-gray-50">
      
      <header class="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8 shadow-sm shrink-0 z-20">
        
        <div class="flex items-center gap-4">
          <h2 class="text-xl font-semibold text-gray-800 tracking-tight">
            {{ getPageTitle() }}
          </h2>

          <button 
            @click="handleRefresh" 
            class="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all active:scale-95"
            title="Refresh Data"
          >
            <RefreshCw :size="18" :class="{'animate-spin': isRefreshing}" />
          </button>
        </div>
        
        <div class="flex items-center space-x-4">
          <div class="text-right hidden sm:block">
            <div class="text-sm font-medium text-gray-900">
                {{ auth.user?.email || 'Administrator' }}
            </div>
            <div class="text-xs text-gray-500 capitalize">
                {{ auth.role?.replace('_', ' ').toLowerCase() || 'User' }}
            </div>
          </div>
          
          <div class="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border-2 border-white shadow-md uppercase">
            {{ auth.user?.email?.charAt(0) || 'A' }}
          </div>
        </div>
      </header>
      
      <div class="shrink-0 z-10 w-full bg-gray-100">
         <TabsBar />
      </div>

      <div class="flex-1 overflow-y-auto p-6 scroll-smooth">
        <div class="max-w-7xl mx-auto pb-10">
          <router-view v-slot="{ Component }">
            <keep-alive>
              <component :is="Component" :key="route.fullPath + '-' + refreshKey" />
            </keep-alive>
          </router-view>
        </div>
      </div>

    </main>
  </div>
</template>