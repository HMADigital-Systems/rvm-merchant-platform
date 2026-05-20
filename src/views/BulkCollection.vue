<script setup lang="ts">
import { ref, reactive } from 'vue';
import { Truck, Plus, Search, RefreshCw, X } from 'lucide-vue-next';

// Reactive state for status filter
const activeFilter = ref('ALL');

// Placeholder data array — replace with API call later
const orders = ref<any[]>([]);
const loading = ref(false);

const filters = ['ALL', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];

const setFilter = (filter: string) => {
  activeFilter.value = filter;
};

const handleRefresh = () => {
  loading.value = true;
  setTimeout(() => { loading.value = false; }, 500);
};

// ========================================
// MODAL STATE
// ========================================
const isModalOpen = ref(false);

const formData = reactive({
  customerName: '',
  phone: '',
  address: '',
  wasteType: '',
  estimatedKg: 0,
  scheduledAt: '',
  notes: ''
});

const openNewOrderModal = () => {
  // Reset form
  formData.customerName = '';
  formData.phone = '';
  formData.address = '';
  formData.wasteType = '';
  formData.estimatedKg = 0;
  formData.scheduledAt = '';
  formData.notes = '';
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
};

const handleOverlayClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
    closeModal();
  }
};

const handleCreateOrder = () => {
  // Validate required fields
  if (!formData.customerName.trim()) {
    alert('Customer name is required');
    return;
  }
  if (!formData.phone.trim()) {
    alert('Phone number is required');
    return;
  }
  if (!formData.address.trim()) {
    alert('Pickup address is required');
    return;
  }

  // Log form data (future: post to API)
  console.log('New Bulk Collection Order:', { ...formData });

  // Placeholder: Add to orders list
  orders.value.unshift({
    id: `order-${Date.now()}`,
    customerName: formData.customerName,
    phone: formData.phone,
    address: formData.address,
    wasteType: formData.wasteType,
    estimatedKg: formData.estimatedKg,
    scheduledAt: formData.scheduledAt,
    notes: formData.notes,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  });

  closeModal();
};
</script>

<template>
  <div class="space-y-6">
    <!-- ================================ -->
    <!-- HEADER                           -->
    <!-- ================================ -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Truck class="text-emerald-600" :size="28" />
          Bulk Collection
        </h1>
        <p class="text-sm text-gray-500 mt-1">Manage pickup orders for large recyclable collections.</p>
      </div>

      <div class="flex items-center gap-3 w-full md:w-auto">
        <button
          @click="handleRefresh"
          :disabled="loading"
          class="flex items-center px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw :size="16" :class="{ 'animate-spin': loading }" class="mr-2" />
          Refresh
        </button>
        <button
          @click="openNewOrderModal"
          class="flex items-center px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Plus :size="18" class="mr-1.5" />
          New Order
        </button>
      </div>
    </div>

    <!-- ================================ -->
    <!-- FILTER PILLS                     -->
    <!-- ================================ -->
    <div class="flex gap-2 flex-wrap">
      <button
        v-for="filter in filters"
        :key="filter"
        @click="setFilter(filter)"
        :class="activeFilter === filter
          ? 'bg-slate-900 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
        class="px-4 py-1.5 text-xs font-bold uppercase rounded-full transition-colors tracking-wide"
      >
        {{ filter }}
      </button>
    </div>

    <!-- ================================ -->
    <!-- MAIN CARD — Table / Empty State  -->
    <!-- ================================ -->
    <div class="bg-white border border-gray-100 rounded-2xl shadow-sm min-h-[400px] flex items-center justify-center">
      <!-- Empty State -->
      <div v-if="!loading && orders.length === 0" class="text-center py-16">
        <Truck class="mx-auto text-gray-300" :size="80" stroke-width="1.5" />
        <p class="text-gray-500 mt-4 text-sm">No bulk collection orders yet</p>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="text-center py-16">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto"></div>
        <p class="text-gray-400 mt-4 text-sm">Loading orders...</p>
      </div>

      <!-- Future Data Table -->
      <div v-else>
        <!-- Order tracking grid once API connected -->
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- MODAL — New Bulk Collection Order                             -->
    <!-- ============================================================ -->
    <Teleport to="body">
      <div
        v-if="isModalOpen"
        class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity"
        @click="handleOverlayClick"
      >
        <!-- Modal Card -->
        <div
          class="bg-white rounded-3xl max-w-xl w-full mx-4 p-8 shadow-2xl transform transition-all duration-200 scale-100"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-900">New Bulk Collection Order</h2>
            <button
              @click="closeModal"
              class="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
            >
              <X :size="22" />
            </button>
          </div>

          <!-- Form -->
          <div class="space-y-5">
            <!-- Customer Name -->
            <div>
              <input
                v-model="formData.customerName"
                type="text"
                placeholder="Customer name *"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all placeholder:text-gray-400"
              />
            </div>

            <!-- Phone Number -->
            <div>
              <input
                v-model="formData.phone"
                type="text"
                placeholder="Phone number"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all placeholder:text-gray-400"
              />
            </div>

            <!-- Pickup Address -->
            <div>
              <input
                v-model="formData.address"
                type="text"
                placeholder="Pickup address"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all placeholder:text-gray-400"
              />
            </div>

            <!-- Waste Details (Inline Split Row) -->
            <div class="grid grid-cols-5 gap-4">
              <div class="col-span-3">
                <input
                  v-model="formData.wasteType"
                  type="text"
                  placeholder="Waste type (e.g. UCO, Plastic)"
                  class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all placeholder:text-gray-400"
                />
              </div>
              <div class="col-span-2">
                <input
                  v-model.number="formData.estimatedKg"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0"
                  class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all placeholder:text-gray-400"
                />
              </div>
            </div>

            <!-- Scheduled Date/Time -->
            <div>
              <input
                v-model="formData.scheduledAt"
                type="datetime-local"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-gray-700"
              />
            </div>

            <!-- Notes -->
            <div>
              <textarea
                v-model="formData.notes"
                placeholder="Notes"
                rows="3"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all placeholder:text-gray-400 resize-none"
              ></textarea>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center justify-end mt-8 pt-4 border-t border-gray-100">
            <button
              @click="closeModal"
              class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-5 py-2.5 rounded-lg transition-colors mr-3 text-sm"
            >
              Cancel
            </button>
            <button
              @click="handleCreateOrder"
              class="bg-purple-600 hover:bg-purple-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm shadow-sm"
            >
              Create Order
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
