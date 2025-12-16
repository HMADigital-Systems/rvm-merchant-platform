<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Lock, Mail, ArrowRight, MonitorSmartphone } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const email = ref('');
const password = ref('');
const loading = ref(false);
const errorMsg = ref('');
const router = useRouter();
const auth = useAuthStore();

const handleLogin = async () => {
  loading.value = true;
  errorMsg.value = '';

  try {
    if (email.value && password.value) {
      // FIX: Actually call the auth store function
      await auth.login(email.value);
      
      // Redirect to dashboard on success
      router.push('/');
    } else {
      errorMsg.value = 'Please enter both email and password';
    }
  } catch (e: any) {
    errorMsg.value = e.message || 'Failed to login';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <div class="flex justify-center text-blue-600 mb-4">
        <MonitorSmartphone :size="48" />
      </div>
      <h2 class="text-center text-3xl font-extrabold text-gray-900">
        RVM Admin
      </h2>
      <p class="mt-2 text-center text-sm text-gray-600">
        Sign in to manage the recycling system
      </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <form class="space-y-6" @submit.prevent="handleLogin">
          
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700">Email address</label>
            <div class="mt-1 relative rounded-md shadow-sm">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail :size="16" class="text-gray-400" />
              </div>
              <input 
                v-model="email"
                id="email" 
                name="email" 
                type="email" 
                autocomplete="email" 
                required 
                class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="admin@company.com"
              />
            </div>
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
            <div class="mt-1 relative rounded-md shadow-sm">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock :size="16" class="text-gray-400" />
              </div>
              <input 
                v-model="password"
                id="password" 
                name="password" 
                type="password" 
                autocomplete="current-password" 
                required 
                class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div v-if="errorMsg" class="rounded-md bg-red-50 p-4">
            <div class="flex">
              <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800">{{ errorMsg }}</h3>
              </div>
            </div>
          </div>

          <div>
            <button 
              type="submit" 
              :disabled="loading"
              class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
            >
              <span v-if="loading">Signing in...</span>
              <span v-else class="flex items-center">
                Sign in <ArrowRight :size="16" class="ml-2" />
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>