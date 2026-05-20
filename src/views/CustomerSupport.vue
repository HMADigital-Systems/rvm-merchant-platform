<script setup lang="ts">
import { ref, computed } from 'vue';
import { LifeBuoy, MessageCircle, Globe, Search } from 'lucide-vue-next';

const openTicket = (ticket: any) => {
  alert(`Ticket: ${ticket.id}
Customer: ${ticket.customer}
Status: ${ticket.status}
Channel: ${ticket.channel}`);
};


// ========================================
// MOCK TICKET DATA
// ========================================
const tickets = ref([
  {
    id: 'TKT-001',
    customer: 'error',
    contact: 'mechanical',
    category: 'Viewer Report',
    priority: 'Medium',
    lead: '-',
    aiSummary: '',
    channel: 'Website',
    assigned: '071582000006',
    status: 'New'
  },
  {
    id: 'TKT-002',
    customer: '0@s.whatsapp.net',
    contact: '+60123456789',
    category: 'General',
    priority: 'Medium',
    lead: '-',
    aiSummary: 'Customer inquiry via customer. *Effortless customer...*',
    channel: 'WhatsApp',
    assigned: 'Unassigned',
    status: 'Pending'
  },
  {
    id: 'TKT-003',
    customer: 'Test Customer',
    contact: '+60123456789',
    category: 'General',
    priority: 'Medium',
    lead: '-',
    aiSummary: '',
    channel: 'Website',
    assigned: 'Unassigned',
    status: 'New'
  }
]);

// ========================================
// FILTERS
// ========================================
const searchQuery = ref('');
const filterStatus = ref('All statuses');
const filterCategory = ref('All categories');
const filterPriority = ref('All priorities');
const filterLeadScore = ref('All lead scores');

const statusOptions = ['All statuses', 'New', 'Pending', 'Resolved', 'Closed'];
const categoryOptions = ['All categories', 'Viewer Report', 'General', 'Technical', 'Billing', 'Sales'];
const priorityOptions = ['All priorities', 'Low', 'Medium', 'High', 'Urgent'];
const leadScoreOptions = ['All lead scores', 'Hot', 'Warm', 'Cold'];

// ========================================
// KPIs
// ========================================
const totalTickets = computed(() => tickets.value.length);
const newTickets = computed(() => tickets.value.filter(t => t.status === 'New').length);
const urgentTickets = computed(() => 0); // placeholder
const pendingTickets = computed(() => tickets.value.filter(t => t.status === 'Pending').length);
const aiProcessed = computed(() => tickets.value.filter(t => t.aiSummary).length);

// ========================================
// FILTERED LIST
// ========================================
const filteredTickets = computed(() => {
  return tickets.value.filter(t => {
    // Search
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      const match = t.customer.toLowerCase().includes(q) || t.contact.includes(q);
      if (!match) return false;
    }
    // Status filter
    if (filterStatus.value !== 'All statuses' && t.status !== filterStatus.value) return false;
    // Category filter
    if (filterCategory.value !== 'All categories' && t.category !== filterCategory.value) return false;
    // Priority filter
    if (filterPriority.value !== 'All priorities' && t.priority !== filterPriority.value) return false;

    return true;
  });
});

// ========================================
// CHANNEL ICON HELPER
// ========================================
const channelIcon = (channel: string) => {
  switch (channel) {
    case 'WhatsApp': return '💬';
    case 'Website': return '🌐';
    default: return '📧';
  }
};

const channelBadgeClass = (channel: string) => {
  switch (channel) {
    case 'WhatsApp': return 'bg-green-50 text-green-700 border-green-200';
    case 'Website': return 'bg-blue-50 text-blue-700 border-blue-200';
    default: return 'bg-gray-50 text-gray-600 border-gray-200';
  }
};
</script>

<template>
  <div class="space-y-6">

    <!-- ================================ -->
    <!-- HEADER                           -->
    <!-- ================================ -->
    <div>
      <h1 class="text-2xl font-bold text-slate-900 flex items-center gap-3">
        <LifeBuoy class="text-emerald-600" :size="28" />
        Customer Service Inbox
      </h1>
      <p class="text-sm text-gray-500 mt-1">Support tickets, complaints, and inbound sales enquiries in one place.</p>
    </div>

    <!-- ================================ -->
    <!-- KPI SUMMARY CARDS               -->
    <!-- ================================ -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div class="bg-white border border-gray-100 p-5 rounded-xl shadow-sm">
        <p class="text-3xl font-bold text-gray-900">{{ totalTickets }}</p>
        <p class="text-sm text-gray-500 mt-1">Total</p>
      </div>
      <div class="bg-white border border-gray-100 p-5 rounded-xl shadow-sm">
        <p class="text-3xl font-bold text-blue-600">{{ newTickets }}</p>
        <p class="text-sm text-gray-500 mt-1">New</p>
      </div>
      <div class="bg-white border border-gray-100 p-5 rounded-xl shadow-sm">
        <p class="text-3xl font-bold text-red-500">{{ urgentTickets }}</p>
        <p class="text-sm text-gray-500 mt-1">Urgent / Hot</p>
      </div>
      <div class="bg-white border border-gray-100 p-5 rounded-xl shadow-sm">
        <p class="text-3xl font-bold text-amber-600">{{ pendingTickets }}</p>
        <p class="text-sm text-gray-500 mt-1">Pending</p>
      </div>
      <div class="bg-white border border-gray-100 p-5 rounded-xl shadow-sm">
        <p class="text-3xl font-bold text-purple-600">{{ aiProcessed }}</p>
        <p class="text-sm text-gray-500 mt-1">AI Processed</p>
      </div>
    </div>

    <!-- ================================ -->
    <!-- FILTERS                          -->
    <!-- ================================ -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="relative flex-1 min-w-[200px] max-w-xs">
        <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search customer / company"
          class="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400"
        />
      </div>

      <select
        v-model="filterStatus"
        class="px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-700"
      >
        <option v-for="opt in statusOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>

      <select
        v-model="filterCategory"
        class="px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-700"
      >
        <option v-for="opt in categoryOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>

      <select
        v-model="filterPriority"
        class="px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-700"
      >
        <option v-for="opt in priorityOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>

      <select
        v-model="filterLeadScore"
        class="px-4 py-2.5 text-sm border-2 border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-700"
      >
        <option v-for="opt in leadScoreOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>
    </div>

    <!-- ================================ -->
    <!-- TICKETS TABLE                    -->
    <!-- ================================ -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
            <tr>
              <th class="px-6 py-4">Customer</th>
              <th class="px-6 py-4">Category</th>
              <th class="px-6 py-4">Priority</th>
              <th class="px-6 py-4">Lead</th>
              <th class="px-6 py-4">AI Summary</th>
              <th class="px-6 py-4">Channel</th>
              <th class="px-6 py-4">Assigned</th>
              <th class="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr
              v-for="ticket in filteredTickets"
              :key="ticket.id"
              class="hover:bg-gray-50 transition-colors"
            >
              <!-- Customer -->
              <td class="px-6 py-4">
                <p class="text-sm font-bold text-gray-900">{{ ticket.customer }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ ticket.contact }}</p>
              </td>

              <!-- Category -->
              <td class="px-6 py-4">
                <span class="text-sm text-gray-700">{{ ticket.category }}</span>
              </td>

              <!-- Priority -->
              <td class="px-6 py-4">
                <span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-600">
                  {{ ticket.priority }}
                </span>
              </td>

              <!-- Lead -->
              <td class="px-6 py-4">
                <span class="text-sm text-gray-400">{{ ticket.lead }}</span>
              </td>

              <!-- AI Summary -->
              <td class="px-6 py-4 max-w-[220px]">
                <span
                  v-if="ticket.aiSummary"
                  class="text-sm text-gray-600 italic leading-relaxed line-clamp-2"
                >
                  {{ ticket.aiSummary }}
                </span>
                <span v-else class="text-sm text-gray-400 italic">No AI summary</span>
              </td>

              <!-- Channel -->
              <td class="px-6 py-4">
                <span
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border"
                  :class="channelBadgeClass(ticket.channel)"
                >
                  {{ channelIcon(ticket.channel) }}
                  {{ ticket.channel }}
                </span>
              </td>

              <!-- Assigned -->
              <td class="px-6 py-4">
                <span
                  :class="ticket.assigned === 'Unassigned' ? 'text-gray-400' : 'text-sm text-gray-700'"
                >
                  {{ ticket.assigned }}
                </span>
              </td>

              <!-- Actions -->
              <td class="px-6 py-4 text-right">
                <button @click="openTicket(ticket)" class="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-1.5 rounded-lg text-sm transition-colors shadow-sm">
                  Open
                </button>
              </td>
            </tr>

            <!-- Empty state -->
            <tr v-if="filteredTickets.length === 0">
              <td colspan="8" class="px-6 py-12 text-center text-gray-400 text-sm">
                <LifeBuoy class="mx-auto text-gray-200 mb-3" :size="48" />
                No tickets found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>
