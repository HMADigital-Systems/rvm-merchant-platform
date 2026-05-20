<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Shield, Plus, Monitor, Eye, Trash2, Building2, X, MonitorSmartphone, Check, Activity, LayoutDashboard, ArrowDownCircle, Users, Package, FileText } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const currentUser = useAuthStore();
const isCurrentUserSuperAdmin = () => currentUser.role === 'SUPER_ADMIN';

// ========================================
// AGENCIES DATA (live from Supabase)
// ========================================
const agencies = ref<any[]>([]);
const agenciesLoading = ref(true);

const fetchAgencies = async () => {
  agenciesLoading.value = true;
  try {
    const { supabase } = await import('../services/supabase');
    
    // Get all app_admins
    const { data: admins } = await supabase.from('app_admins').select('id, email, role, created_at, page_permissions');
    if (!admins) { agencies.value = []; return; }
    
    // Get all machine assignments
    const { data: assignments } = await supabase
      .from('viewer_machine_assignments')
      .select('admin_id, machine_id, machines!inner(device_no)');
    
    // Build machine map by admin_id
    const machineMap: Record<string, string[]> = {};
    (assignments || []).forEach((a: any) => {
      if (!machineMap[a.admin_id]) machineMap[a.admin_id] = [];
      const deviceNo = a.machines?.device_no || String(a.machine_id);
      if (!machineMap[a.admin_id].includes(deviceNo)) {
        machineMap[a.admin_id].push(deviceNo);
      }
    });
    
    agencies.value = admins.map((a: any) => ({
      id: a.id,
      email: a.email,
      role: a.role,
      createdAt: a.created_at ? new Date(a.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      assignedMachines: machineMap[a.id] || []
    }));
  } catch (e) {
    console.error('Failed to fetch agencies:', e);
  } finally {
    agenciesLoading.value = false;
  }
};

const openPagesAccess = (agencyId: string) => {
  console.log(`[Agencies] Open pages access for: ${agencyId}`);
  // Future: open modal to set page permissions
};

const removeAgency = (agencyId: string) => {
  console.log(`[Agencies] Remove agency: ${agencyId}`);
  agencies.value = agencies.value.filter(a => a.id !== agencyId);
};

// ========================================
// MACHINE ACCESS MODAL
// ========================================
const isMachineModalOpen = ref(false);
const selectedAgency = ref<any>(null);
const selectedMachineIds = ref<string[]>([]);
const takenMachines = ref<Record<string, string>>({}); // device_no → other admin email

const allMachines = ref<{ device_no: string; zone: string; id: number }[]>([]);

onMounted(async () => {
  try {
    const { supabase } = await import('../services/supabase');
    const { data } = await supabase.from('machines').select('id, device_no, zone').eq('is_active', true).order('zone');
    if (data) allMachines.value = data;
  } catch (e) {
    console.warn('Could not fetch machines:', e);
  }
  await fetchAgencies();
});

const openMachineModal = async (agency: any) => {
  selectedAgency.value = agency;
  
  // Fetch all assignments to find taken machines
  takenMachines.value = {};
  try {
    const { supabase } = await import('../services/supabase');
    const { data: allAssignments } = await supabase
      .from('viewer_machine_assignments')
      .select('admin_id, machine_id');
    
    if (allAssignments) {
      // Get admin emails
      const adminIds = [...new Set(allAssignments.map((a: any) => a.admin_id))];
      const { data: admins } = await supabase
        .from('app_admins')
        .select('id, email')
        .in('id', adminIds);
      
      const adminEmailMap: Record<string, string> = {};
      (admins || []).forEach((a: any) => { adminEmailMap[a.id] = a.email; });
      
      // Build taken map (machines assigned to OTHER admins)
      const adminId = agency.id;
      // Map machine_id to device_no
      const machineIdToDev: Record<number, string> = {};
      allMachines.value.forEach(m => { machineIdToDev[m.id] = m.device_no; });
      
      allAssignments.forEach((a: any) => {
        if (a.admin_id !== adminId) {
          const dev = machineIdToDev[a.machine_id];
          if (dev) {
            takenMachines.value[dev] = adminEmailMap[a.admin_id] || 'Another viewer';
          }
        }
      });
    }
  } catch (e) {
    console.warn('Could not fetch taken machines:', e);
  }
  
  // Pre-select current viewer's machines
  if (allMachines.value.length === 0) {
    selectedMachineIds.value = [...agency.assignedMachines];
  } else {
    const shortIds = agency.assignedMachines.map((s: string) => s.replace(/^0+/, ''));
    selectedMachineIds.value = allMachines.value
      .filter(m => shortIds.some((s: string) => m.device_no.endsWith(s)))
      .map(m => m.device_no);
  }
  isMachineModalOpen.value = true;
};

const toggleMachine = (deviceNo: string) => {
  // Can't toggle taken machines
  if (takenMachines.value[deviceNo]) return;
  const idx = selectedMachineIds.value.indexOf(deviceNo);
  if (idx >= 0) {
    selectedMachineIds.value.splice(idx, 1);
  } else {
    selectedMachineIds.value.push(deviceNo);
  }
};

const closeMachineModal = () => {
  isMachineModalOpen.value = false;
  selectedAgency.value = null;
};

const saveMachineAccess = async () => {
  if (!selectedAgency.value) return;
  
  const agencyEmail = selectedAgency.value.email;
  const adminId = selectedAgency.value.id;
  
  try {
    const { supabase } = await import('../services/supabase');
    
    // Delete existing assignments for this admin
    await supabase.from('viewer_machine_assignments').delete().eq('admin_id', adminId);
    
    // Find matching machine IDs for selected device_nos
    const selectedMachineIdsNum = allMachines.value
      .filter(m => selectedMachineIds.value.includes(m.device_no))
      .map(m => parseInt(String(m.id)));
    
    if (selectedMachineIdsNum.length > 0) {
      // Get current admin's ID for assigned_by
      const { data: currentAdmin } = await supabase
        .from('app_admins')
        .select('id')
        .eq('email', 'admin@hmadigital.asia')
        .single();
      
      const newAssignments = selectedMachineIdsNum.map(mid => ({
        admin_id: adminId,
        machine_id: mid,
        assigned_by: currentAdmin?.id || null
      }));
      
      await supabase.from('viewer_machine_assignments').upsert(newAssignments, {
        onConflict: 'admin_id,machine_id'
      });
    }
    
    // Update local state
    selectedAgency.value.assignedMachines = selectedMachineIds.value;
    console.log(`[Agencies] Saved machines for ${agencyEmail}:`, selectedMachineIds.value);
  } catch (e) {
    console.error('Failed to save machine assignments:', e);
  }
  
  closeMachineModal();
};

// ========================================
// PAGE PERMISSIONS MODAL
// ========================================
const isPagesModalOpen = ref(false);
const allowedPages = ref<string[]>([]);

const pageGroups = [
  {
    header: 'DASHBOARD',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
      { id: 'live-ops', label: 'Live Command Center', icon: 'Activity' },
      { id: 'machines', label: 'Machine Status', icon: 'MonitorSmartphone' },
    ]
  },
  {
    header: 'OPERATIONS',
    items: [
      { id: 'submissions', label: 'Submissions', icon: 'Package' },
      { id: 'collections', label: 'Collections', icon: 'Truck' },
      { id: 'withdrawal', label: 'Withdrawal', icon: 'ArrowDownCircle' },
      { id: 'users', label: 'Users', icon: 'Users' },
      { id: 'machines', label: 'Machines', icon: 'MonitorSmartphone' },
      { id: 'shop-orders', label: 'Shop Orders', icon: 'ShoppingBag' },
      { id: 'reports', label: 'Reports', icon: 'FileText' },
      { id: 'bulk-collection', label: 'Bulk Collection', icon: 'Truck' },
    ]
  }
];

const openPagesModal = (agency: any) => {
  selectedAgency.value = agency;
  // Load saved page_permissions or use defaults
  allowedPages.value = agency.page_permissions?.length > 0 
    ? [...agency.page_permissions] 
    : ['dashboard', 'submissions', 'machines'];
  isPagesModalOpen.value = true;
};

const togglePage = (pageId: string) => {
  const idx = allowedPages.value.indexOf(pageId);
  if (idx >= 0) {
    allowedPages.value.splice(idx, 1);
  } else {
    allowedPages.value.push(pageId);
  }
};

const closePagesModal = () => {
  isPagesModalOpen.value = false;
  selectedAgency.value = null;
};

const savePagePermissions = async () => {
  if (!selectedAgency.value) return;
  try {
    const { supabase } = await import('../services/supabase');
    const { error } = await supabase
      .from('app_admins')
      .update({ page_permissions: allowedPages.value })
      .eq('id', selectedAgency.value.id);
    if (error) throw error;
    const agency = agencies.value.find((a: any) => a.id === selectedAgency.value.id);
    if (agency) agency.page_permissions = [...allowedPages.value];
    console.log(`[Agencies] Saved pages for ${selectedAgency.value.email}:`, allowedPages.value);
  } catch (e) {
    console.error('Failed to save page permissions:', e);
  }
  closePagesModal();
};

// ========================================
// ADD ACCOUNT MODAL
// ========================================
const isAddAccountModalOpen = ref(false);
const form = ref({ email: '', role: 'VIEWER' });

const openAddAccountModal = () => {
  form.value = { email: '', role: 'VIEWER' };
  isAddAccountModalOpen.value = true;
};

const closeAddAccountModal = () => {
  isAddAccountModalOpen.value = false;
};

const handleOverlayClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
    closeAddAccountModal();
  }
};

const submitAddAccount = () => {
  if (!form.value.email.trim()) {
    alert('Email address is required');
    return;
  }
  console.log('[Agencies] Create account:', { ...form.value });
  // Future: API call
  agencies.value.unshift({
    id: `ag-${Date.now()}`,
    email: form.value.email,
    role: form.value.role,
    createdAt: new Date().toLocaleDateString('en-US'),
    assignedMachines: []
  });
  closeAddAccountModal();
};

const roleStyle = (role: string) => {
  return role === 'VIEWER'
    ? 'text-blue-600 font-bold'
    : 'text-purple-600 font-bold';
};
</script>

<template>
  <div class="space-y-6">

    <!-- ================================ -->
    <!-- HEADER                           -->
    <!-- ================================ -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Building2 class="text-emerald-600" :size="28" />
          Agencies Management
        </h1>
        <p class="text-sm text-gray-500 mt-1">Create viewer accounts, assign machine access, and set page permissions.</p>
      </div>

      <div class="flex items-center gap-3">
        <button v-if="isCurrentUserSuperAdmin()"
          @click="openAddAccountModal"
          class="flex items-center px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Plus :size="18" class="mr-1.5" />
          Add Account
        </button>
      </div>
    </div>

    <!-- ================================ -->
    <!-- AGENCIES CARD LIST               -->
    <!-- ================================ -->
    <div class="space-y-4">
      <div
        v-for="agency in agencies"
        :key="agency.id"
        class="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <!-- LEFT: Account Info -->
        <div class="flex items-start gap-4 flex-1 min-w-0">
          <!-- Icon Decorator -->
          <div class="h-12 w-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Building2 :size="22" />
          </div>

          <!-- Account Details -->
          <div class="min-w-0">
            <!-- Email -->
            <p class="text-sm font-bold text-gray-900 truncate">{{ agency.email }}</p>

            <!-- Role & Date -->
            <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                class="text-xs uppercase tracking-wide"
                :class="roleStyle(agency.role)"
              >
                {{ agency.role }}
              </span>
              <span class="text-xs text-gray-400">|</span>
              <span class="text-xs text-gray-400">Created: {{ agency.createdAt }}</span>
            </div>

            <!-- Machine Access Tokens (Viewer only) -->
            <div
              v-if="agency.role === 'VIEWER'"
              class="flex flex-wrap gap-1.5 mt-2"
            >
              <span
                v-for="machine in agency.assignedMachines"
                :key="machine"
                class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono bg-blue-50 text-blue-600 border border-blue-100"
              >
                {{ machine }}
              </span>
            </div>
          </div>
        </div>

        <!-- RIGHT: Actions -->
        <div class="flex items-center gap-3 shrink-0">
          <!-- Machines Mapping (Viewer only - Super Admin only) -->
          <button
            v-if="agency.role === 'VIEWER' && isCurrentUserSuperAdmin()"
            @click="openMachineModal(agency)"
            class="flex items-center gap-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Monitor :size="16" />
            Machines
          </button>

          <!-- Pages Access (Viewer only - Super Admin only) -->
          <button
            v-if="agency.role === 'VIEWER' && isCurrentUserSuperAdmin()"
            @click="openPagesModal(agency)"
            class="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Eye :size="16" />
            Pages
          </button>

          <!-- Remove (Super Admin only) -->
          <button
            v-if="isCurrentUserSuperAdmin()"
            @click="removeAgency(agency.id)"
            class="flex items-center gap-1.5 bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Trash2 :size="16" />
            Remove
          </button>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- MODAL — Add Account                                          -->
    <!-- ============================================================ -->
    <Teleport to="body">
      <div
        v-if="isAddAccountModalOpen"
        class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity"
        @click="handleOverlayClick"
      >
        <div
          class="bg-white rounded-3xl max-w-md w-full mx-4 p-8 shadow-2xl transform transition-all duration-200 scale-100"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between mb-1">
            <h2 class="text-xl font-bold text-slate-900">Add Account</h2>
            <button
              @click="closeAddAccountModal"
              class="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
            >
              <X :size="22" />
            </button>
          </div>
          <p class="text-sm text-gray-500 mb-6">Create a new viewer or super admin account.</p>

          <!-- Form -->
          <div class="space-y-5">
            <!-- Email Address -->
            <div>
              <label class="text-sm font-medium text-slate-800 mb-1.5 block">Email Address</label>
              <input
                v-model="form.email"
                type="text"
                placeholder="user@example.com"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all placeholder:text-gray-400"
              />
            </div>

            <!-- Role -->
            <div>
              <label class="text-sm font-medium text-slate-800 mb-1.5 block">Role</label>
              <select
                v-model="form.role"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-gray-700"
              >
                <option value="VIEWER">Viewer (Can view data only)</option>
                <option value="SUPER_ADMIN">Super Admin (Full access)</option>
              </select>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end mt-8 pt-4 border-t border-gray-100">
            <button
              @click="closeAddAccountModal"
              class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-5 py-2.5 rounded-lg transition-colors mr-3 text-sm"
            >
              Cancel
            </button>
            <button
              @click="submitAddAccount"
              class="bg-purple-600 hover:bg-purple-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm shadow-sm"
            >
              Create Account
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ============================================================ -->
    <!-- MODAL — Machine Access                                       -->
    <!-- ============================================================ -->
    <Teleport to="body">
      <div
        v-if="isMachineModalOpen"
        class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity"
        @click="handleOverlayClick"
      >
        <div
          class="bg-white rounded-3xl max-w-lg w-full mx-4 p-8 shadow-xl flex flex-col max-h-[85vh]"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-start justify-between mb-1">
            <div>
              <h2 class="text-xl font-bold text-slate-900 mb-1">Machine Access: {{ selectedAgency?.email }}</h2>
              <p class="text-sm text-gray-500 mb-6">Select machines this viewer can see.</p>
            </div>
            <button
              @click="closeMachineModal"
              class="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100 shrink-0"
            >
              <X :size="22" />
            </button>
          </div>

          <!-- Scrollable Machine List -->
          <div class="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-200">
            <div
              v-for="machine in allMachines"
              :key="machine.device_no"
              @click="toggleMachine(machine.device_no)"
              class="border rounded-2xl p-4 flex items-center justify-between transition cursor-pointer"
              :class="takenMachines[machine.device_no]
                ? 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed'
                : selectedMachineIds.includes(machine.device_no)
                  ? 'border-purple-200 bg-purple-50/40'
                  : 'border-gray-100 hover:bg-slate-50'"
            >
              <!-- Left: Icon + Info -->
              <div class="flex items-center gap-3">
                <MonitorSmartphone :size="24" :class="takenMachines[machine.device_no] ? 'text-gray-300' : 'text-gray-400'" class="shrink-0" />
                <div>
                  <p class="text-sm font-semibold" :class="takenMachines[machine.device_no] ? 'text-gray-400' : 'text-slate-800'">{{ machine.device_no }}</p>
                  <p class="text-xs text-gray-500">
                    <template v-if="takenMachines[machine.device_no]">🔒 Taken by {{ takenMachines[machine.device_no].split('@')[0] }}</template>
                    <template v-else>{{ machine.zone || 'Available' }}</template>
                  </p>
                </div>
              </div>

              <!-- Right: Status indicator -->
              <div
                v-if="!takenMachines[machine.device_no]"
                class="w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all shrink-0"
                :class="selectedMachineIds.includes(machine.device_no)
                  ? 'bg-purple-600 border-purple-600'
                  : 'border-gray-300'"
              >
                <Check v-if="selectedMachineIds.includes(machine.device_no)" :size="12" class="text-white" />
              </div>
              <span v-else class="text-[10px] text-gray-400 font-medium">Taken</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between pt-4 mt-4 border-t border-gray-100">
            <p class="text-xs text-gray-400">{{ selectedMachineIds.length }} machine(s) selected</p>
            <div class="flex gap-3">
              <button
                @click="closeMachineModal"
                class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-5 py-2.5 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                @click="saveMachineAccess"
                class="bg-purple-600 hover:bg-purple-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm shadow-sm"
              >
                Save Access
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ============================================================ -->
    <!-- MODAL — Page Permissions                                    -->
    <!-- ============================================================ -->
    <Teleport to="body">
      <div
        v-if="isPagesModalOpen"
        class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity"
        @click="handleOverlayClick"
      >
        <div
          class="bg-white rounded-3xl max-w-lg w-full mx-4 p-8 shadow-xl relative max-h-[85vh] flex flex-col"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-start justify-between mb-1">
            <div>
              <h2 class="text-xl font-bold text-slate-900 mb-1">Page Permissions</h2>
              <p class="text-sm text-gray-500 mb-6">Choose which pages {{ selectedAgency?.email }} can view.</p>
            </div>
            <button
              @click="closePagesModal"
              class="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100 shrink-0"
            >
              <X :size="22" />
            </button>
          </div>

          <!-- Scrollable Groups -->
          <div class="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
            <template v-for="group in pageGroups" :key="group.header">
              <p class="text-xs font-bold text-gray-400 tracking-wider uppercase mb-3 mt-6 first:mt-0 block">{{ group.header }}</p>

              <div
                v-for="item in group.items"
                :key="item.id"
                @click="togglePage(item.id)"
                class="border rounded-xl p-3 mb-2.5 flex items-center justify-between transition-colors cursor-pointer"
                :class="allowedPages.includes(item.id)
                  ? 'border-emerald-200 bg-emerald-50/30'
                  : 'border-gray-100 bg-white hover:bg-gray-50'"
              >
                <div class="flex items-center gap-3">
                  <MonitorSmartphone :size="20" class="text-gray-400 shrink-0" />
                  <span class="text-sm font-medium text-slate-800">{{ item.label }}</span>
                </div>

                <!-- Toggle Badge -->
                <div
                  v-if="allowedPages.includes(item.id)"
                  class="bg-emerald-500 border-emerald-500 text-white flex items-center justify-center rounded-full w-5 h-5"
                >
                  <Check :size="12" />
                </div>
                <div
                  v-else
                  class="border-2 border-gray-200 rounded-full w-5 h-5"
                ></div>
              </div>
            </template>
          </div>

          <!-- Footer Actions -->
          <div class="border-t border-gray-50 pt-4 flex items-center justify-end gap-3 mt-6">
            <button
              @click="closePagesModal"
              class="bg-gray-50 hover:bg-gray-100 text-gray-600 font-medium px-5 py-2 rounded-xl text-sm transition-colors"
            >
              Close
            </button>
            <button
              @click="savePagePermissions"
              class="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors"
            >
              <Check :size="16" />
              Save Permissions
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
