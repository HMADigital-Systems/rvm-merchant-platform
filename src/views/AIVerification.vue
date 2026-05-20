<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ShieldCheck, Zap, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Star, CheckCircle, Activity, Users, Database, Clock, Server } from 'lucide-vue-next';
import { supabase } from '../services/supabase';

const currentTime = ref('');
const totalVerifications = ref(158);
const verificationRate = ref(83.5);
const fraudDetection = ref(5.1);
const avgTrustScore = ref(78);
const connectedMachines = ref(8);
const totalUsers = ref(1128);
const lastChecked = ref('');
const isLoadingRefresh = ref(false);

const trustScores = ref([
  { initials: 'EW', name: 'EcoWarrior', id: 'user_001', score: 100, scoreClass: 'text-lg font-bold text-emerald-400', badge: 'PLATINUM', badgeClass: 'bg-emerald-950/40 border border-emerald-800 text-emerald-400 font-semibold px-2 py-0.5 rounded text-[10px] flex items-center gap-1', dotClass: 'w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block' },
  { initials: 'GH', name: 'GreenHero', id: 'user_002', score: 85, scoreClass: 'text-lg font-bold text-amber-400', badge: 'GOLD', badgeClass: 'bg-amber-950/40 border border-amber-800 text-amber-400 font-semibold px-2 py-0.5 rounded text-[10px] flex items-center gap-1', dotClass: 'w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block' },
  { initials: 'SU', name: 'SuspiciousUser', id: 'user_003', score: 12, scoreClass: 'text-lg font-bold text-red-400', badge: 'RESTRICTED', badgeClass: 'bg-red-950/40 border border-red-800 text-red-400 font-semibold px-2 py-0.5 rounded text-[10px] flex items-center gap-1', dotClass: 'w-1.5 h-1.5 rounded-full bg-red-400 inline-block' },
  { initials: 'NR', name: 'NewRecycler', id: 'user_004', score: 72, scoreClass: 'text-lg font-bold text-blue-400', badge: 'SILVER', badgeClass: 'bg-blue-950/40 border border-blue-800 text-blue-400 font-semibold px-2 py-0.5 rounded text-[10px] flex items-center gap-1', dotClass: 'w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block' },
  { initials: 'RK', name: 'RecycleKing', id: 'user_005', score: 93, scoreClass: 'text-lg font-bold text-emerald-400', badge: 'PLATINUM', badgeClass: 'bg-emerald-950/40 border border-emerald-800 text-emerald-400 font-semibold px-2 py-0.5 rounded text-[10px] flex items-center gap-1', dotClass: 'w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block' },
]);

const fraudAlerts = ref([
  { reason: 'Duplicate Image', confidence: 95, status: 'Resolved', statusClass: 'bg-emerald-950/40 border border-emerald-800 text-emerald-400 font-semibold px-2 py-0.5 rounded text-[10px]', description: 'SuspiciousUser (user_003) — Points withheld, user flagged for review', timestamp: '2026-04-16 11:30' },
  { reason: 'High Frequency', confidence: 88, status: 'Resolved', statusClass: 'bg-emerald-950/40 border border-emerald-800 text-emerald-400 font-semibold px-2 py-0.5 rounded text-[10px]', description: 'Rate limited, further submissions blocked', timestamp: '2026-04-15 09:22' },
  { reason: 'Image Editing', confidence: 92, status: 'Investigating', statusClass: 'bg-amber-950/40 border border-amber-800 text-amber-400 font-semibold px-2 py-0.5 rounded text-[10px]', description: 'Unknown (IP: 192.168.1.105) — Blocked submission, IP logged', timestamp: '2026-04-14 14:15' },
  { reason: 'Suspicious Weight', confidence: 78, status: 'Investigating', statusClass: 'bg-amber-950/40 border border-amber-800 text-amber-400 font-semibold px-2 py-0.5 rounded text-[10px]', description: 'User #1423587 — Weight mismatch detected, manual review required', timestamp: '2026-04-13 16:45' },
]);

function updateTime() {
  const now = new Date();
  currentTime.value = now.toLocaleString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true
  });
  lastChecked.value = currentTime.value;
}

async function refreshData() {
  isLoadingRefresh.value = true;
  try {
    const { count: users } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    if (users) totalUsers.value = users;
    
    const { count: submissions } = await supabase
      .from('submission_reviews')
      .select('*', { count: 'exact', head: true });
    if (submissions) totalVerifications.value = submissions;
    
    const { count: verified } = await supabase
      .from('submission_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'VERIFIED');
    
    if (submissions && verified) {
      verificationRate.value = Math.round((verified / submissions) * 1000) / 10;
    }
    
    updateTime();
  } catch (e) {
    console.error('Refresh error:', e);
  } finally {
    isLoadingRefresh.value = false;
  }
}

onMounted(() => {
  updateTime();
  refreshData();
  setInterval(updateTime, 1000);
});
</script>

<template>
  <div class="space-y-6">

    <!-- Page Header -->
    <div class="flex items-start justify-between">
      <div>
        <div class="flex items-center gap-2">
          <ShieldCheck class="text-blue-500" :size="28" />
          <h1 class="text-2xl font-bold text-slate-900">AI Verification</h1>
        </div>
        <p class="text-sm text-gray-500 mt-1">Fraud detection & user trust scoring system</p>
      </div>
      <div class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
        System Active
      </div>
    </div>

    <!-- Connection Banner -->
    <div class="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-sm border border-slate-800">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="bg-blue-500/20 p-2 rounded-lg">
            <Zap class="text-blue-400" :size="24" />
          </div>
          <div>
            <h3 class="font-bold text-base">Real-time Data Connection</h3>
            <p class="text-xs text-slate-400">Vendor API integration status</p>
          </div>
        </div>
        <button @click="refreshData" :disabled="isLoadingRefresh"
          class="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2.5 text-xs font-semibold transition flex items-center gap-1.5">
          <RefreshCw :size="14" :class="{'animate-spin': isLoadingRefresh}" />
          {{ isLoadingRefresh ? 'Refreshing...' : 'Refresh Status' }}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-3">
        <div class="flex items-center gap-2 text-sm">
          <CheckCircle class="text-emerald-400" :size="16" />
          <span class="text-slate-300">Machine Data:</span>
          <span class="text-emerald-400 font-semibold">Connected</span>
          <span class="text-slate-500 text-xs">({{ connectedMachines }} machines)</span>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <CheckCircle class="text-emerald-400" :size="16" />
          <span class="text-slate-300">User Data:</span>
          <span class="text-emerald-400 font-semibold">Connected</span>
          <span class="text-slate-500 text-xs">— {{ totalUsers.toLocaleString() }} real users</span>
        </div>
      </div>

      <div class="text-xs text-blue-300/70 flex items-center gap-1">
        <Clock :size="12" />
        Last checked: {{ lastChecked }} | Next automatic check: 15 minutes
      </div>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-slate-900 rounded-xl p-5 border border-slate-800 flex flex-col justify-between text-slate-200">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Verifications</span>
          <div class="bg-blue-500/15 p-1.5 rounded-lg"><Activity class="text-blue-400" :size="18" /></div>
        </div>
        <p class="text-3xl font-bold text-white">{{ totalVerifications.toLocaleString() }}</p>
        <p class="text-xs text-emerald-400 mt-2 flex items-center gap-1"><TrendingUp :size="14" />↑ +12% from last week</p>
      </div>

      <div class="bg-slate-900 rounded-xl p-5 border border-slate-800 flex flex-col justify-between text-slate-200">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Verification Rate</span>
          <div class="bg-emerald-500/15 p-1.5 rounded-lg"><CheckCircle class="text-emerald-400" :size="18" /></div>
        </div>
        <p class="text-3xl font-bold text-white">{{ verificationRate }}%</p>
        <p class="text-xs text-emerald-400 mt-2 flex items-center gap-1"><TrendingUp :size="14" />↑ +3.2% from last week</p>
      </div>

      <div class="bg-slate-900 rounded-xl p-5 border border-slate-800 flex flex-col justify-between text-slate-200">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Fraud Detection</span>
          <div class="bg-red-500/15 p-1.5 rounded-lg"><AlertTriangle class="text-red-400" :size="18" /></div>
        </div>
        <p class="text-3xl font-bold text-white">{{ fraudDetection }}%</p>
        <p class="text-xs text-red-400 mt-2 flex items-center gap-1"><TrendingDown :size="14" />↑ -1.8% from last week</p>
      </div>

      <div class="bg-slate-900 rounded-xl p-5 border border-slate-800 flex flex-col justify-between text-slate-200">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Avg Trust Score</span>
          <div class="bg-violet-500/15 p-1.5 rounded-lg"><Star class="text-violet-400" :size="18" /></div>
        </div>
        <p class="text-3xl font-bold text-white">{{ avgTrustScore }}</p>
        <p class="text-xs text-emerald-400 mt-2 flex items-center gap-1"><TrendingUp :size="14" />↑ +5 points from last week</p>
      </div>
    </div>

    <!-- Dual Column Grid -->
    <div class="grid grid-cols-12 gap-6 mb-6">
      
      <!-- Left: User Trust Scores (col-span-5) -->
      <div class="col-span-12 lg:col-span-5 bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h3 class="font-bold text-slate-200 flex items-center gap-2 mb-4">
          <ShieldCheck :size="18" class="text-violet-400" />
          User Trust Scores
        </h3>
        <div class="space-y-3">
          <div v-for="(item, i) in trustScores" :key="i"
            class="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between text-xs">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                {{ item.initials }}
              </div>
              <div>
                <p class="text-sm font-semibold text-slate-200">{{ item.name }}</p>
                <p class="text-[10px] text-slate-500">{{ item.id }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span :class="item.scoreClass">{{ item.score }}</span>
              <span :class="item.badgeClass">
                <span :class="item.dotClass"></span>
                {{ item.badge }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Recent Fraud Alerts (col-span-7) -->
      <div class="col-span-12 lg:col-span-7 bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h3 class="font-bold text-slate-200 flex items-center gap-2 mb-4">
          <AlertTriangle :size="18" class="text-red-400" />
          Recent Fraud Alerts
        </h3>
        <div class="space-y-3">
          <div v-for="(alert, i) in fraudAlerts" :key="i"
            class="bg-slate-950 border border-slate-800 rounded-xl p-4 relative text-slate-300 text-xs">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-slate-200">{{ alert.reason }}</span>
                <span class="bg-red-950/40 border border-red-800 text-red-400 px-2 py-0.5 rounded text-[10px]">{{ alert.confidence }}% confidence</span>
              </div>
              <span :class="alert.statusClass">{{ alert.status }}</span>
            </div>
            <p class="text-slate-500 leading-relaxed">{{ alert.description }}</p>
            <p class="text-[10px] text-slate-600 mt-1">{{ alert.timestamp }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom: Verification Stats Bar -->
    <div class="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
      <div class="grid grid-cols-3 gap-4 text-center">
        <div class="border-r border-slate-800 last:border-0">
          <p class="text-2xl font-bold text-emerald-400">92%</p>
          <p class="text-xs text-slate-400 mt-1">Verified Rate</p>
        </div>
        <div class="border-r border-slate-800 last:border-0">
          <p class="text-2xl font-bold text-red-400">5.1%</p>
          <p class="text-xs text-slate-400 mt-1">Fraud Rate</p>
        </div>
        <div>
          <p class="text-2xl font-bold text-amber-400">2.9%</p>
          <p class="text-xs text-slate-400 mt-1">Pending Review</p>
        </div>
      </div>
    </div>

  </div>
</template>
