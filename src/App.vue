<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router';
import Sidebar from './components/Sidebar.vue';

const route = useRoute();
</script>

<template>
  <div v-if="route.meta.hideSidebar" class="min-h-screen bg-gray-50">
     <RouterView />
  </div>

  <div v-else class="flex min-h-screen bg-gray-50">
    <Sidebar />

    <main class="flex-1 ml-64 p-8">
      <RouterView />
    </main>
  </div>
</template>