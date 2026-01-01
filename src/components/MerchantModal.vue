<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Save, X, AlertCircle } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  editData?: any | null; // If null, we are in "Create" mode
  isSubmitting: boolean;
}>();

const emit = defineEmits(['close', 'submit']);

// Default Form State
const defaultForm = {
  name: '',
  currency: 'RM',
  adminEmail: '',
  rate_plastic: 0.1,
  rate_can: 0.1,
  rate_glass: 0.1,
  assignedMachines: '' // Comma separated string
};

const form = ref({ ...defaultForm });

const isEditMode = computed(() => !!props.editData);

// Watch for Modal Open/Close to Reset or Fill Data
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    if (props.editData) {
      // Fill for Edit
      form.value = {
        name: props.editData.name,
        currency: props.editData.currency_symbol,
        adminEmail: '', // Usually don't edit email here directly to avoid sync issues
        rate_plastic: props.editData.rate_plastic,
        rate_can: props.editData.rate_can,
        rate_glass: props.editData.rate_glass,
        // Pre-fill existing machines (comma separated)
        assignedMachines: props.editData.machines?.map((m: any) => m.device_no).join(', ') || ''
      };
    } else {
      // Reset for Create
      form.value = { ...defaultForm };
    }
  }
});

const handleSubmit = () => {
  emit('submit', { ...form.value });
};
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
      
      <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h2 class="text-lg font-bold text-gray-900">
          {{ isEditMode ? 'Edit Client Settings' : 'Onboard New Client' }}
        </h2>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 transition-colors">
          <X :size="20" />
        </button>
      </div>

      <div class="p-6 space-y-5 overflow-y-auto">
        
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1.5">Company Name</label>
          <input 
            v-model="form.name" 
            type="text" 
            class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition-all" 
            placeholder="e.g. Aeon Mall Tebrau" 
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1.5">Currency</label>
            <input v-model="form.currency" type="text" class="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="RM" />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1.5">Rates (P / C / G)</label>
            <div class="flex gap-2">
              <input v-model="form.rate_plastic" type="number" step="0.01" class="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-center" placeholder="P" />
              <input v-model="form.rate_can" type="number" step="0.01" class="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-center" placeholder="C" />
              <input v-model="form.rate_glass" type="number" step="0.01" class="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-center" placeholder="G" />
            </div>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1.5 flex justify-between">
            <span>Assign Machines</span>
            <span class="text-gray-400 font-normal normal-case">Comma separated Device IDs</span>
          </label>
          <textarea 
            v-model="form.assignedMachines" 
            rows="2"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-mono text-sm"
            placeholder="e.g. 071582000002, 071582000005"
          ></textarea>
          <p class="text-[10px] text-gray-400 mt-1">
            <AlertCircle :size="10" class="inline mr-1"/>
            Existing assignments will remain. Adding IDs here will transfer those machines to this merchant.
          </p>
        </div>

        <div v-if="!isEditMode" class="bg-purple-50 p-4 rounded-lg border border-purple-100">
          <label class="block text-xs font-bold text-purple-800 uppercase mb-1.5">Primary Admin Email</label>
          <input 
            v-model="form.adminEmail" 
            type="email" 
            class="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white" 
            placeholder="manager@client.com" 
          />
          <p class="text-xs text-purple-600 mt-2 leading-relaxed">
            Invites the user as a <strong>Super Admin</strong> for this merchant. They can set their password via "First Time Activation".
          </p>
        </div>

      </div>

      <div class="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
        <button 
          @click="$emit('close')" 
          class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium text-sm transition-colors"
        >
          Cancel
        </button>
        <button 
          @click="handleSubmit" 
          :disabled="isSubmitting"
          class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 font-medium text-sm transition-all shadow-sm hover:shadow active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <Save :size="16" />
          <span>{{ isEditMode ? 'Save Changes' : 'Create Account' }}</span>
        </button>
      </div>

    </div>
  </div>
</template>