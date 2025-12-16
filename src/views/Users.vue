<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabaseService } from '../services/api';
import type { User } from '../types';
import { RouterLink } from 'vue-router';
import { ChevronRight, Smartphone, Hash, Calendar, Trophy } from 'lucide-vue-next';

const users = ref<User[]>([]);

onMounted(async () => {
  const data = await supabaseService.getUsers();
  users.value = data;
});
</script>

<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
    <div class="px-8 py-6 border-b border-gray-100 bg-gray-50/50">
      <h2 class="text-lg font-bold text-gray-900">User Management</h2>
      <p class="text-sm text-gray-500 mt-1">Local database users synced with Hardware API</p>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold tracking-wider">
          <tr>
            <th class="px-8 py-4">Vendor ID</th>
            <th class="px-8 py-4">Phone</th>
            <th class="px-8 py-4">Cached Lifetime Points</th>
            <th class="px-8 py-4">Joined</th>
            <th class="px-8 py-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50/80 transition-colors group">
            <td class="px-8 py-4">
              <div class="flex items-center text-sm text-gray-600 font-mono">
                <Hash :size="12" class="mr-1.5 text-gray-400" />
                {{ user.vendor_user_no }}
              </div>
            </td>
            <td class="px-8 py-4">
              <div class="flex items-center text-sm font-medium text-gray-900">
                <Smartphone :size="14" class="mr-2 text-gray-400" />
                {{ user.phone }}
              </div>
            </td>
            <td class="px-8 py-4">
              <div class="flex items-center text-sm text-blue-600 font-bold">
                <Trophy :size="14" class="mr-2" />
                {{ user.lifetime_integral }} pts
              </div>
            </td>
            <td class="px-8 py-4">
              <div class="flex items-center text-sm text-gray-500">
                <Calendar :size="14" class="mr-2 text-gray-400" />
                {{ new Date(user.created_at).toLocaleDateString() }}
              </div>
            </td>
            <td class="px-8 py-4 text-right">
              <RouterLink 
                :to="`/users/${user.id}`"
                class="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline decoration-blue-200 underline-offset-4"
              >
                View Details <ChevronRight :size="14" class="ml-0.5" />
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>