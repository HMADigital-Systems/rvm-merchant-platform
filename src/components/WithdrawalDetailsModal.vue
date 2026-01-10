<script setup lang="ts">
import { X, CreditCard, User, Building, ShieldAlert } from 'lucide-vue-next';

defineProps<{
  isOpen: boolean;
  // FIX: Allow the prop to have extra properties like sub_withdrawals
  withdrawal: any; 
}>();

const emit = defineEmits(['close']);
</script>

<template>
  <div v-if="isOpen && withdrawal" class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
    <div @click="emit('close')" class="absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"></div>

    <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
      
      <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 class="text-lg font-bold text-gray-900">Withdrawal Details</h3>
        <button @click="emit('close')" class="p-2 bg-white rounded-full text-gray-400 hover:text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors">
          <X :size="20" />
        </button>
      </div>

      <div class="p-6 overflow-y-auto space-y-6">

        <div class="flex justify-between items-center p-4 rounded-xl bg-gray-50 border border-gray-100">
           <div>
              <div class="text-xs text-gray-500 uppercase font-bold tracking-wider">Amount Request</div>
              <div class="text-2xl font-bold text-gray-900">{{ withdrawal.amount }} pts</div>
           </div>
           <div class="text-right">
              <div class="text-xs text-gray-500 uppercase font-bold tracking-wider">Current Status</div>
              <span :class="`inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold ${
                withdrawal.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                withdrawal.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                'bg-amber-100 text-amber-700'
              }`">
                {{ withdrawal.status }}
              </span>
           </div>
        </div>

        <div v-if="withdrawal.is_bundled" class="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                <Building :size="14" class="mr-2"/> Split Breakdown
            </h4>
            <div class="space-y-2">
                <div v-for="sub in withdrawal.sub_withdrawals" :key="sub.id" class="flex justify-between text-sm items-center bg-white p-2 rounded border border-gray-100 shadow-sm">
                    <div class="flex flex-col">
                        <span class="font-medium text-gray-800">
                            {{ sub.merchants?.name || (sub.merchant_id ? `Merchant ${sub.merchant_id.slice(0,4)}...` : 'System / Legacy') }}
                        </span>
                        <span class="text-[10px] text-gray-400">{{ new Date(sub.created_at).toLocaleTimeString() }}</span>
                    </div>
                    <span class="font-bold text-gray-900">{{ sub.amount }} pts</span>
                </div>
            </div>
        </div>

        <div>
          <h4 class="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3 border-b pb-2">
            <User :size="16" class="text-blue-500"/> User Profile
          </h4>
          <div class="grid grid-cols-2 gap-4 text-sm">
             <div>
                <span class="block text-xs text-gray-500">Nickname</span>
                <span class="font-medium text-gray-900">{{ withdrawal.users?.nickname || 'Guest' }}</span>
             </div>
             <div>
                <span class="block text-xs text-gray-500">Phone Number</span>
                <span class="font-mono text-gray-700">{{ withdrawal.users?.phone || '-' }}</span>
             </div>
             <div class="col-span-2">
                <span class="block text-xs text-gray-500">User ID</span>
                <span class="font-mono text-xs text-gray-400 break-all">{{ withdrawal.user_id }}</span>
             </div>
          </div>
        </div>

        <div>
          <h4 class="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3 border-b pb-2">
            <CreditCard :size="16" class="text-purple-500"/> Payment Destination
          </h4>
          <div class="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-3">
             <div class="grid grid-cols-2 gap-4">
                <div>
                  <span class="block text-xs text-slate-400">Bank Name</span>
                  <span class="font-bold text-slate-700">{{ withdrawal.bank_name || '-' }}</span>
                </div>
                <div>
                  <span class="block text-xs text-slate-400">Holder Name</span>
                  <span class="font-medium text-slate-700">{{ withdrawal.account_holder_name || '-' }}</span>
                </div>
             </div>
             <div>
                <span class="block text-xs text-slate-400">Account Number</span>
                <span class="font-mono text-lg font-bold text-slate-800 tracking-wide">{{ withdrawal.account_number || '-' }}</span>
             </div>
          </div>
        </div>

        <div>
          <h4 class="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3 border-b pb-2">
            <ShieldAlert :size="16" class="text-amber-500"/> Admin & Audit
          </h4>
          <div class="grid grid-cols-2 gap-4 text-sm">
             <div>
                <span class="block text-xs text-gray-500">Requested At</span>
                <span class="text-gray-700">{{ new Date(withdrawal.created_at).toLocaleString() }}</span>
             </div>
             <div>
                <span class="block text-xs text-gray-500">Last Updated</span>
                <span class="text-gray-700">{{ new Date(withdrawal.updated_at).toLocaleString() }}</span>
             </div>
             <div class="col-span-2">
                <span class="block text-xs text-gray-500">Admin Note</span>
                <p v-if="withdrawal.admin_note" class="mt-1 text-sm bg-yellow-50 text-yellow-800 p-2 rounded border border-yellow-100">
                  {{ withdrawal.admin_note }}
                  <span v-if="withdrawal.reviewed_by" class="block mt-1 text-[10px] text-yellow-600 opacity-75">— {{ withdrawal.reviewed_by }}</span>
                </p>
                <p v-else class="text-gray-400 italic text-sm">No notes provided.</p>
             </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>