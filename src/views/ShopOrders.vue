<script setup lang="ts">
import { ref, computed } from 'vue';
import { ShoppingBag, Ticket, Search, RefreshCw } from 'lucide-vue-next';

// ========================================
// MOCK DATA
// ========================================
const orders = ref([
  {
    id: '#MGP-0003',
    channel: 'Voucher (WhatsApp)',
    phone: '60113001019',
    item: 'RM15 Shopee Voucher',
    amount: 15.00,
    date: '06 May',
    status: 'Pending'
  },
  {
    id: '#MGP-0001',
    channel: 'Voucher (WhatsApp)',
    phone: '60113001019',
    item: 'RM5 Shopee Voucher',
    amount: 5.00,
    date: '02 May',
    status: 'Completed'
  },
  {
    id: '#MGP-0002',
    channel: 'Voucher (WhatsApp)',
    phone: '60113001019',
    item: 'RM5 Shopee Voucher',
    amount: 5.00,
    date: '02 May',
    status: 'Processing'
  }
]);

// ========================================
// FILTERS
// ========================================
const selectedStatus = ref('All Statuses');
const selectedType = ref('All Types');

const statusOptions = ['All Statuses', 'Pending', 'Processing', 'Completed', 'Cancelled'];
const typeOptions = ['All Types', 'Voucher', 'Product', 'Gift Card'];

const filteredOrders = computed(() => {
  return orders.value.filter(o => {
    const statusMatch = selectedStatus.value === 'All Statuses' || o.status === selectedStatus.value;
    return statusMatch;
  });
});

// ========================================
// KPIs
// ========================================
const totalOrders = computed(() => orders.value.length);
const pendingCount = computed(() => orders.value.filter(o => o.status === 'Pending').length);
const processingCount = computed(() => orders.value.filter(o => o.status === 'Processing').length);
const completedCount = computed(() => orders.value.filter(o => o.status === 'Completed').length);

// ========================================
// ACTIONS
// ========================================
const updateOrderStatus = (orderId: string, newStatus: string) => {
  const order = orders.value.find(o => o.id === orderId);
  if (order) {
    order.status = newStatus;
    console.log(`[ShopOrders] Order ${orderId} status updated to: ${newStatus}`);
  }
};

const viewOrder = (orderId: string) => {
  console.log(`[ShopOrders] View order: ${orderId}`);
  // Future: open detail modal or navigate
};

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'Pending': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Processing': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Cancelled': return 'bg-red-100 text-red-700 border-red-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
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
          <ShoppingBag class="text-emerald-600" :size="28" />
          MyGreenShop Orders
        </h1>
        <p class="text-sm text-gray-500 mt-1">View and manage all voucher and product redemptions.</p>
      </div>

      <div class="flex items-center gap-3 w-full md:w-auto">
        <select
          v-model="selectedStatus"
          class="px-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-700"
        >
          <option v-for="opt in statusOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <select
          v-model="selectedType"
          class="px-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-700"
        >
          <option v-for="opt in typeOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>
      </div>
    </div>

    <!-- ================================ -->
    <!-- KPI SUMMARY ROW                  -->
    <!-- ================================ -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p class="text-3xl font-bold text-gray-900">{{ totalOrders }}</p>
        <p class="text-sm text-gray-500 mt-1">Total Orders</p>
      </div>
      <div class="bg-amber-50/50 rounded-2xl border border-amber-100 shadow-sm p-5">
        <p class="text-3xl font-bold text-amber-700">{{ pendingCount }}</p>
        <p class="text-sm text-amber-600 mt-1">Pending</p>
      </div>
      <div class="bg-blue-50/50 rounded-2xl border border-blue-100 shadow-sm p-5">
        <p class="text-3xl font-bold text-blue-700">{{ processingCount }}</p>
        <p class="text-sm text-blue-600 mt-1">Processing</p>
      </div>
      <div class="bg-emerald-50/50 rounded-2xl border border-emerald-100 shadow-sm p-5">
        <p class="text-3xl font-bold text-emerald-700">{{ completedCount }}</p>
        <p class="text-sm text-emerald-600 mt-1">Completed</p>
      </div>
    </div>

    <!-- ================================ -->
    <!-- ORDERS TABLE                     -->
    <!-- ================================ -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
            <tr>
              <th class="px-6 py-4">Order</th>
              <th class="px-6 py-4">User</th>
              <th class="px-6 py-4">Item</th>
              <th class="px-6 py-4">Amount</th>
              <th class="px-6 py-4">Date</th>
              <th class="px-6 py-4">Status</th>
              <th class="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="order in filteredOrders" :key="order.id" class="hover:bg-gray-50 transition-colors">
              <!-- ORDER ID -->
              <td class="px-6 py-4">
                <span class="text-sm text-gray-500 font-mono">{{ order.id }}</span>
              </td>

              <!-- USER -->
              <td class="px-6 py-4">
                <p class="text-sm font-semibold text-gray-900">{{ order.channel }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ order.phone }}</p>
              </td>

              <!-- ITEM -->
              <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                  <Ticket :size="16" class="text-amber-500 shrink-0" />
                  <span class="text-sm text-gray-900">{{ order.item }}</span>
                </div>
              </td>

              <!-- AMOUNT -->
              <td class="px-6 py-4">
                <span class="text-sm font-bold text-emerald-600">RM {{ order.amount.toFixed(2) }}</span>
              </td>

              <!-- DATE -->
              <td class="px-6 py-4">
                <span class="text-sm text-gray-600">{{ order.date }}</span>
              </td>

              <!-- STATUS -->
              <td class="px-6 py-4">
                <span
                  class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border"
                  :class="statusBadgeClass(order.status)"
                >
                  {{ order.status }}
                </span>
              </td>

              <!-- ACTIONS -->
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <button
                    @click="viewOrder(order.id)"
                    class="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                  >
                    View
                  </button>
                  <select
                    :value="order.status"
                    @change="updateOrderStatus(order.id, ($event.target as HTMLSelectElement).value)"
                    class="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-700 cursor-pointer"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Processing">Processing</option>
                    <option value="Done (Sent)">Done (Sent)</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </td>
            </tr>

            <!-- Empty state -->
            <tr v-if="filteredOrders.length === 0">
              <td colspan="7" class="px-6 py-12 text-center text-gray-400 text-sm">
                <ShoppingBag class="mx-auto text-gray-200 mb-3" :size="48" />
                No orders found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
