<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../../services/supabase';
import { Plus, X, Building2, MonitorSmartphone, Mail } from 'lucide-vue-next';

interface Investor {
  id: string;
  nickname: string;
  email: string;
  company_name: string;
  machine_count?: number;
}

interface Machine {
  id: number;
  device_no: string;
  name: string;
}

const investors = ref<Investor[]>([]);
const machines = ref<Machine[]>([]);
const loading = ref(false);
const showModal = ref(false);
const submitting = ref(false);

const form = ref({
  name: '',
  email: '',
  companyName: '',
  machineIds: [] as number[]
});

const fetchInvestors = async () => {
  loading.value = true;
  const { data, error } = await supabase
    .from('users')
    .select('id, nickname, email, company_name')
    .eq('role', 'investor')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching investors:', error);
    loading.value = false;
    return;
  }

  const investorIds = (data || []).map(i => i.id);
  
  if (investorIds.length > 0) {
    const { data: machineData } = await supabase
      .from('machines')
      .select('id, investor_id')
      .in('investor_id', investorIds);

    const machineCountMap: Record<string, number> = {};
    (machineData || []).forEach(m => {
      if (m.investor_id) {
        machineCountMap[m.investor_id] = (machineCountMap[m.investor_id] || 0) + 1;
      }
    });

    investors.value = (data || []).map(i => ({
      ...i,
      machine_count: machineCountMap[i.id] || 0
    }));
  } else {
    investors.value = data || [];
  }

  loading.value = false;
};

const fetchAvailableMachines = async () => {
  console.log('[InvestorManagement] Fetching available machines...');
  const { data, error } = await supabase
    .from('machines')
    .select('id, device_no, name')
    .is('investor_id', null)
    .order('name', { ascending: true });

  if (error) {
    console.error('[InvestorManagement] Error fetching machines:', error);
    // Fallback: just get all machines if column doesn't exist yet
    const { data: allMachines } = await supabase
      .from('machines')
      .select('id, device_no, name')
      .order('name', { ascending: true });
    machines.value = allMachines || [];
  } else {
    machines.value = data || [];
  }
};

const testApi = async () => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return alert('No token');

    const response = await fetch('/api/admin/investors', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await response.json();
    console.log('API Test Result:', result);
    alert(JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.error(e);
    alert('Error: ' + e.message);
  }
};

const openModal = async () => {
  form.value = { name: '', email: '', companyName: '', machineIds: [] };
  await fetchAvailableMachines();
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const handleSubmit = async () => {
  if (!form.value.name || !form.value.email || !form.value.companyName) {
    alert('Please fill in all required fields');
    return;
  }

  submitting.value = true;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      alert('Session expired. Please login again.');
      submitting.value = false;
      return;
    }

    console.log('[InvestorForm] Submitting to /api/admin/investors');

    const response = await fetch('/api/admin/investors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: form.value.name,
        email: form.value.email,
        companyName: form.value.companyName,
        machineIds: form.value.machineIds
      })
    });

    console.log('[InvestorForm] Response status:', response.status);

    const contentType = response.headers.get('content-type');
    console.log('[InvestorForm] Content-Type:', contentType);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[InvestorForm] Error response:', errorText);
      throw new Error(`Server error (${response.status}): ${errorText || response.statusText}`);
    }

    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('[InvestorForm] Non-JSON response:', text);
      throw new Error('Server returned non-JSON response: ' + (text.substring(0, 100)));
    }

    const result = await response.json();

    if (result.success) {
      alert(`✅ Investor created successfully!\n\nEmail: ${result.data.email}\nTemporary Password: ${result.data.temporary_password}\n\nPlease share the password with the investor.`);
      closeModal();
      await fetchInvestors();
    } else {
      alert('❌ Error: ' + result.error);
    }
  } catch (err: any) {
    alert('❌ Error: ' + err.message);
  } finally {
    submitting.value = false;
  }
};

const availableMachines = computed(() => {
  return machines.value.map(m => ({
    value: m.id,
    label: `${m.name} (${m.device_no})`
  }));
});

const toggleMachine = (machineId: number) => {
  const idx = form.value.machineIds.indexOf(machineId);
  if (idx > -1) {
    form.value.machineIds.splice(idx, 1);
  } else {
    form.value.machineIds.push(machineId);
  }
};

onMounted(() => {
  fetchInvestors();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900">Investor Management</h2>
        <p class="text-sm text-gray-500 mt-1">Manage investor accounts and machine assignments</p>
      </div>
      <button
        @click="testApi"
        class="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
      >
        Test API
      </button>
      <button
        @click="openModal"
        class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Plus :size="18" />
        Add New Investor
      </button>
    </div>

    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Number of Machines</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-if="loading">
            <td colspan="3" class="px-6 py-8 text-center text-gray-500">Loading...</td>
          </tr>
          <tr v-else-if="investors.length === 0">
            <td colspan="3" class="px-6 py-8 text-center text-gray-500">No investors found</td>
          </tr>
          <tr v-for="investor in investors" :key="investor.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold">
                  {{ investor.nickname?.charAt(0) || 'I' }}
                </div>
                <div>
                  <div class="text-sm font-medium text-gray-900">{{ investor.nickname }}</div>
                  <div class="text-xs text-gray-500">{{ investor.email }}</div>
                </div>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex items-center gap-2 text-sm text-gray-700">
                <Building2 :size="16" class="text-gray-400" />
                {{ investor.company_name || '-' }}
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex items-center gap-2">
                <MonitorSmartphone :size="16" class="text-gray-400" />
                <span class="text-sm font-medium text-gray-900">{{ investor.machine_count || 0 }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div class="flex items-center justify-between p-4 border-b">
          <h3 class="text-lg font-semibold text-gray-900">Add New Investor</h3>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600">
            <X :size="20" />
          </button>
        </div>
        
        <form @submit.prevent="handleSubmit" class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              v-model="form.name"
              type="text"
              class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter investor name"
              required
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <div class="relative">
              <Mail :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                v-model="form.email"
                type="email"
                class="w-full pl-10 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="investor@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
            <div class="relative">
              <Building2 :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                v-model="form.companyName"
                type="text"
                class="w-full pl-10 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Company name"
                required
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Assign Machines</label>
            <div v-if="availableMachines.length === 0" class="text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">
              No unassigned machines available
            </div>
            <div v-else class="max-h-48 overflow-y-auto border rounded-lg divide-y">
              <label
                v-for="machine in availableMachines"
                :key="machine.value"
                class="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="form.machineIds.includes(machine.value)"
                  @change="toggleMachine(machine.value)"
                  class="h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <span class="text-sm text-gray-700">{{ machine.label }}</span>
              </label>
            </div>
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              @click="closeModal"
              class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="submitting"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {{ submitting ? 'Creating...' : 'Create Investor' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>