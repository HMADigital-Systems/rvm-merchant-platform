<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { useAuthStore } from './stores/auth';

const auth = useAuthStore();

// Restore session on refresh
onMounted(() => {
  if (!auth.user) {
    auth.initializeAuth();
  }
});
</script>

<template>
  <RouterView />
</template>