<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Building2, UserPlus, MonitorSmartphone, User } from 'lucide-vue-next';
import { useMerchants, type AdminMerchant } from '../../composables/useMerchants';
import MerchantModal from '../../components/MerchantModal.vue';

const { merchants, loading, fetchMerchants, saveMerchant, deleteMerchantAdmin, toggleStatus } = useMerchants();

const showModal = ref(false);
const editingMerchant = ref<AdminMerchant | null>(null);

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

onMounted(() => fetchMerchants());
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
          <tr v-for="m in merchants" :key="m.id" class="hover:bg-gray-50/80 transition-colors">
            
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
              <button 
                @click="openEditModal(m)"
                class="text-sm font-medium text-purple-600 hover:text-purple-800 hover:underline decoration-purple-200 underline-offset-4"
              >
                Edit
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <MerchantModal 
      :isOpen="showModal" 
      :isSubmitting="loading"
      :editData="editingMerchant"
      @close="showModal = false"
      @submit="handleModalSubmit"
      @delete-admin="handleDeleteAdmin" 
    />
  </div>
</template>