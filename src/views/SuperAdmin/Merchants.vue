<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Building2, UserPlus, MonitorSmartphone, User, Trash2, ChevronDown } from 'lucide-vue-next';
import { useMerchants, type AdminMerchant } from '../../composables/useMerchants';
import { supabase } from '../../services/supabase';
import MerchantModal from '../../components/MerchantModal.vue';
import SimpleConfirmModal from '../../components/SimpleConfirmModal.vue';

const { merchants, loading, fetchMerchants, saveMerchant, deleteMerchantAdmin, deleteMerchant, toggleStatus } = useMerchants();

const allMachines = ref<{ device_no: string; name: string; merchant_id?: string }[]>([]);

const fetchAllMachines = async () => {
  const { data } = await supabase
    .from('machines')
    .select('device_no, name, merchant_id');
  if (data) {
    allMachines.value = data;
  }
};

const showModal = ref(false);
const showDeleteModal = ref(false);
const editingMerchant = ref<AdminMerchant | null>(null);
const deletingMerchant = ref<AdminMerchant | null>(null);

// Filter state
const selectedCompanyFilter = ref<string>('all');

// Computed filtered merchants based on company selection
const filteredMerchants = computed(() => {
  if (selectedCompanyFilter.value === 'all') {
    return merchants.value;
  }
  return merchants.value.filter(m => m.id === selectedCompanyFilter.value);
});

const openCreateModal = () => {
  editingMerchant.value = null;
  showModal.value = true;
};

const openEditModal = (merchant: AdminMerchant) => {
  editingMerchant.value = merchant;
  showModal.value = true;
};

const handleModalSubmit = async (formData: any) => {
  const isEdit = !!editingMerchant.value;
  const merchantId = editingMerchant.value?.id;

  if (!formData.name) return alert("Company Name is required");

  const res = await saveMerchant(formData, isEdit, merchantId);

  if (res.success) {
    alert(isEdit ? "✅ Changes Saved & Fleet Updated!" : "✅ Client Created Successfully!");
    showModal.value = false;
    // Refresh machines after save
    await fetchAllMachines();
  } else {
    alert("❌ Error: " + res.message);
  }
};

const handleDeleteAdmin = async (adminId: string) => {
    const success = await deleteMerchantAdmin(adminId);
    if (success) {
        // If successful, we need to update the local 'editingMerchant' data so the modal reflects the deletion instantly
        if (editingMerchant.value && editingMerchant.value.admins) {
            editingMerchant.value.admins = editingMerchant.value.admins.filter(a => a.id !== adminId);
        }
    }
};

const openDeleteModal = (merchant: AdminMerchant) => {
    deletingMerchant.value = merchant;
    showDeleteModal.value = true;
};

const handleDeleteConfirm = async () => {
    if (!deletingMerchant.value) return;
    const res = await deleteMerchant(deletingMerchant.value.id);
    showDeleteModal.value = false;
    deletingMerchant.value = null;
    if (res?.success) {
        alert('✅ Client deleted successfully!');
    } else {
        alert('❌ Error: ' + res?.message);
    }
};

onMounted(() => {
  fetchMerchants();
  fetchAllMachines();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 flex items-center">
          <Building2 class="mr-3 text-purple-600" :size="28" />
          Client Management
        </h1>
        <p class="text-gray-500 mt-1">Onboard new merchants, assign machines, and manage access.</p>
      </div>
      <button 
        @click="openCreateModal"
        class="flex items-center space-x-2 text-sm text-white bg-purple-600 hover:bg-purple-700 px-4 py-2.5 rounded-xl shadow-lg shadow-purple-200 transition-all active:scale-95"
      >
        <UserPlus :size="18" />
        <span class="font-bold">New Client</span>
      </button>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      
      <!-- Company Filter Dropdown -->
      <div class="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-4">
        <label class="text-sm font-semibold text-gray-600">Filter by Company:</label>
        <div class="relative">
          <select 
            v-model="selectedCompanyFilter"
            class="appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none cursor-pointer min-w-[200px]"
          >
            <option value="all">All Companies ({{ merchants.length }})</option>
            <option v-for="merchant in merchants" :key="merchant.id" :value="merchant.id">
              {{ merchant.name }}
            </option>
          </select>
          <ChevronDown class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" :size="16" />
        </div>
        <span v-if="selectedCompanyFilter !== 'all'" class="text-xs text-gray-500">
          Showing {{ filteredMerchants.length }} result(s)
        </span>
      </div>

      <div v-if="loading" class="p-8 text-center text-gray-400">Loading clients...</div>
      
      <table v-else class="w-full text-left">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
          <tr>
            <th class="px-6 py-4">Company</th>
            <th class="px-6 py-4">Currency</th>
            <th class="px-6 py-4">Admins</th>
            <th class="px-6 py-4">Assigned Machines</th>
            <th class="px-6 py-4">Status</th>
            <th class="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="m in filteredMerchants" :key="m.id" class="hover:bg-gray-50/80 transition-colors">
            
            <td class="px-6 py-4">
              <div class="font-bold text-gray-900">{{ m.name }}</div>
            </td>

            <td class="px-6 py-4 text-sm text-gray-500 font-mono">
               {{ m.currency_symbol }}
            </td>

            <td class="px-6 py-4">
               <div v-if="m.admins && m.admins.length > 0" class="space-y-1">
                 <div v-for="admin in m.admins" :key="admin.id" class="flex items-center text-xs text-gray-600">
                    <User :size="12" class="mr-1.5 text-gray-400"/> {{ admin.email }}
                 </div>
               </div>
               <span v-else class="text-xs text-gray-400 italic">No admins invited</span>
            </td>

            <td class="px-6 py-4">
              <div v-if="m.machines && m.machines.length > 0" class="flex flex-wrap gap-1">
                <span v-for="machine in m.machines" :key="machine.device_no" class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100" title="Machine ID">
                  <MonitorSmartphone :size="10" class="mr-1"/> {{ machine.device_no }}
                </span>
              </div>
              <span v-else class="text-xs text-gray-400 italic">No machines assigned</span>
            </td>

            <td class="px-6 py-4">
              <button 
                @click="toggleStatus(m)"
                :class="`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-full border transition-all ${
                  m.is_active 
                  ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' 
                  : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                }`"
              >
                {{ m.is_active ? 'Active' : 'Suspended' }}
              </button>
            </td>

            <td class="px-6 py-4 text-right">
              <div class="flex items-center justify-end gap-3">
                <button 
                  @click="openEditModal(m)"
                  class="text-sm font-medium text-purple-600 hover:text-purple-800 hover:underline decoration-purple-200 underline-offset-4"
                >
                  Edit
                </button>
                <button 
                  @click="openDeleteModal(m)"
                  class="text-sm font-medium text-red-600 hover:text-red-800 hover:underline decoration-red-200 underline-offset-4"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <MerchantModal 
      :isOpen="showModal" 
      :isSubmitting="loading"
      :editData="editingMerchant"
      :merchants="merchants"
      :allMachines="allMachines"
      @close="showModal = false"
      @submit="handleModalSubmit"
      @delete-admin="handleDeleteAdmin" 
    />

    <SimpleConfirmModal
        :isOpen="showDeleteModal"
        title="Delete Client"
        :message="`Are you sure you want to delete ${deletingMerchant?.name}? This action cannot be undone and will remove all related data including admins, machines, wallets, and transactions.`"
        :isProcessing="loading"
        confirmText="Delete"
        @close="showDeleteModal = false"
        @confirm="handleDeleteConfirm"
    />
  </div>
</template>