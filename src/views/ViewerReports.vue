<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import { Send, Clock, CheckCircle2, XCircle, AlertCircle, FileText, Bell, Check, Info } from 'lucide-vue-next';

const auth = useAuthStore();
const reports = ref<any[]>([]);
const loading = ref(false);
const activeTab = ref<'submit' | 'history' | 'updates'>('history');

const machines = ref<any[]>([]);
const selectedMachine = ref('');
const issueType = ref('other');
const description = ref('');
const submitting = ref(false);
const submitMsg = ref('');
const submitOk = ref(false);

const issueTypes = [
  { value: 'machine_offline', label: 'Machine Offline' },
  { value: 'bin_full', label: 'Bin Full / Overflow' },
  { value: 'mechanical', label: 'Mechanical Issue' },
  { value: 'sensor', label: 'Sensor Malfunction' },
  { value: 'cleaning', label: 'Needs Cleaning' },
  { value: 'other', label: 'Other' },
];

const loadMachines = async () => {
  const { data: admin } = await supabase.from('app_admins').select('id').eq('email', auth.user?.email).single();
  if (!admin) return;
  const { data: assignments } = await supabase.from('viewer_machine_assignments').select('machine_id').eq('admin_id', admin.id);
  const ids = (assignments || []).map((a: any) => a.machine_id);
  if (ids.length === 0) return;
  const { data: m } = await supabase.from('machines').select('id, device_no, name, address').in('id', ids);
  machines.value = m || [];
};

const loadReports = async () => {
  const { data: admin } = await supabase.from('app_admins').select('id').eq('email', auth.user?.email).single();
  if (!admin) return;
  const { data } = await supabase.from('customer_service_tickets').select('*').eq('category', 'viewer_report').eq('customer_email', auth.user?.email || '').order('created_at', { ascending: false });
  reports.value = (data || []).map((r: any) => ({
    id: r.id, machine_name: r.assigned_to || '', issue_type: r.customer_phone || 'other',
    description: r.customer_name || '', status: r.status || 'pending',
    admin_note: r.priority || '', created_at: r.created_at
  }));
};

const submitReport = async () => {
  if (!selectedMachine.value || !description.value) return;
  submitting.value = true; submitMsg.value = '';
  const { data: admin } = await supabase.from('app_admins').select('id').eq('email', auth.user?.email).single();
  if (!admin) { submitMsg.value = 'Admin not found'; submitOk.value = false; submitting.value = false; return; }
  const machine = machines.value.find(m => String(m.id) === selectedMachine.value);
  const { error } = await supabase.from('customer_service_tickets').insert({
    customer_name: description.value, customer_email: auth.user?.email || '',
    customer_phone: issueType.value, category: 'viewer_report', status: 'Open',
    assigned_to: machine?.device_no || '', priority: 'Medium'
  });
  if (error) { submitMsg.value = 'Error: ' + error.message; submitOk.value = false; }
  else {
    submitMsg.value = '✅ Report submitted'; submitOk.value = true;
    selectedMachine.value = ''; description.value = '';
    activeTab.value = 'history'; await loadReports();
  }
  submitting.value = false;
};

// Notifications
const notifications = ref<any[]>([]);
const notifLoading = ref(false);

const loadNotifications = async () => {
  if (!auth.user?.email) return;
  notifLoading.value = true;
  try {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_email', auth.user.email)
      .order('created_at', { ascending: false })
      .limit(20);
    notifications.value = data || [];
  } catch (e) {
    console.warn('Failed to load notifications:', e);
  } finally {
    notifLoading.value = false;
  }
};

const notifIcon = (n: any) => {
  const ref = n.reference_type || '';
  if (ref.endsWith('_in_progress')) return Clock;
  if (ref.endsWith('_resolved')) return CheckCircle2;
  if (ref.endsWith('_reported') || ref.endsWith('_pending')) return AlertCircle;
  return n.type === 'SUCCESS' ? CheckCircle2 : n.type === 'WARNING' ? AlertCircle : Info;
};

const notifColor = (n: any) => {
  const ref = n.reference_type || '';
  if (ref.endsWith('_in_progress')) return 'bg-amber-100 text-amber-600';
  if (ref.endsWith('_resolved')) return 'bg-green-100 text-green-600';
  if (ref.endsWith('_reported') || ref.endsWith('_pending')) return 'bg-red-100 text-red-600';
  return n.type === 'SUCCESS' ? 'bg-green-100 text-green-600' : n.type === 'WARNING' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600';
};

const formatNotifDate = (d: string) => {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return diff + 'm ago';
  if (diff < 1440) return Math.floor(diff / 60) + 'h ago';
  return date.toLocaleDateString();
};

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    'Open': 'bg-blue-100 text-blue-700 border-blue-200', 'In Progress': 'bg-amber-100 text-amber-700 border-amber-200',
    'Resolved': 'bg-green-100 text-green-700 border-green-200', 'Closed': 'bg-gray-100 text-gray-600 border-gray-200',
  }; return map[s] || 'bg-gray-100 text-gray-700 border-gray-200';
};
const issueLabel = (v: string) => issueTypes.find(i => i.value === v)?.label || v;

onMounted(async () => {
  loading.value = true;
  await Promise.all([loadMachines(), loadReports(), loadNotifications()]);
  loading.value = false;
});
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <h1 class="text-xl font-bold text-gray-900 flex items-center gap-2">
      <FileText :size="24" class="text-blue-600" />
      Machine Reports
    </h1>
    <div class="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
      <button @click="activeTab = 'submit'" :class="`px-4 py-2 text-sm font-medium rounded-lg ${activeTab === 'submit' ? 'bg-white shadow' : 'text-gray-500'}`">Submit Report</button>
      <button @click="activeTab = 'history'" :class="`px-4 py-2 text-sm font-medium rounded-lg ${activeTab === 'history' ? 'bg-white shadow' : 'text-gray-500'}`">My Reports ({{ reports.length }})</button>
      <button @click="activeTab = 'updates'" :class="`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-1.5 ${activeTab === 'updates' ? 'bg-white shadow' : 'text-gray-500'}`"><Bell :size="14" /> Updates ({{ notifications.length }})</button>
    </div>

    <div v-if="activeTab === 'submit'" class="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Machine</label>
        <select v-model="selectedMachine" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">Select a machine...</option>
          <option v-for="m in machines" :key="m.id" :value="String(m.id)">{{ m.device_no }} - {{ m.name || m.address }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Issue Type</label>
        <select v-model="issueType" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option v-for="t in issueTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea v-model="description" rows="4" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" placeholder="Describe the issue..." />
      </div>
      <button @click="submitReport" :disabled="submitting || !selectedMachine || !description"
        class="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-bold">
        <Send :size="16" /> {{ submitting ? 'Submitting...' : 'Submit Report' }}
      </button>
      <div v-if="submitMsg" :class="submitOk ? 'text-green-600' : 'text-red-600'" class="text-sm">{{ submitMsg }}</div>
    </div>

    <div v-if="activeTab === 'history'" class="space-y-3">
      <div v-if="loading" class="text-center py-8 text-gray-400">Loading...</div>
      <div v-else-if="reports.length === 0" class="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
        <FileText :size="40" class="mx-auto mb-3 text-gray-300" /><p>No reports yet</p>
      </div>
      <div v-for="r in reports" :key="r.id" class="bg-white rounded-2xl border border-gray-100 p-5">
        <div class="flex justify-between items-start mb-2">
          <div>
            <span class="text-sm font-bold text-gray-900">{{ r.machine_name || 'Machine' }}</span>
            <span class="text-xs text-gray-400 ml-2">{{ new Date(r.created_at).toLocaleDateString() }}</span>
          </div>
          <span :class="`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full border ${statusBadge(r.status)}`">{{ r.status }}</span>
        </div>
        <p class="text-xs text-gray-500 mb-1">{{ issueLabel(r.issue_type) }}</p>
        <p class="text-sm text-gray-700">{{ r.description }}</p>
        <p v-if="r.admin_note" class="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-100">{{ r.admin_note }}</p>
      </div>
    </div>

    <!-- ===== UPDATES TAB ===== -->
    <div v-if="activeTab === 'updates'" class="space-y-2">
      <div v-if="notifLoading" class="text-center py-8 text-gray-400">Loading...</div>
      <div v-else-if="notifications.length === 0" class="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
        <Bell :size="40" class="mx-auto mb-3 text-gray-300" /><p>No updates yet</p>
        <p class="text-xs text-gray-400 mt-1">You'll see updates here when admin responds to your reports</p>
      </div>
      <div v-for="n in notifications" :key="n.id"
        class="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3"
        :class="{ 'bg-blue-50/40': !n.is_read }"
      >
        <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" :class="notifColor(n)">
          <component :is="notifIcon(n)" :size="18" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-gray-900">{{ n.title }}</p>
          <p class="text-xs text-gray-600 mt-0.5">{{ n.message }}</p>
          <p class="text-[10px] text-gray-400 mt-1">{{ formatNotifDate(n.created_at) }}</p>
        </div>
        <div v-if="!n.is_read" class="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
      </div>
    </div>
  </div>
</template>
