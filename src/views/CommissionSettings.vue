<script setup lang="ts">
import { ref } from 'vue';
import { Percent, Save } from 'lucide-vue-next';

// ========================================
// COMMISSION TIERS
// ========================================
const commissionTiers = ref([
  { level: 1, name: 'Level 1', type: 'Agency (machine owner)', value: 5 },
  { level: 2, name: 'Level 2', type: 'Introducer', value: 2 },
  { level: 3, name: 'Level 3', type: 'Introducer', value: 1 }
]);

// ========================================
// SAVE HANDLER
// ========================================
const saveCommissionSettings = () => {
  const payload = {
    tiers: commissionTiers.value.map(t => ({
      level: t.level,
      percentage: t.value
    }))
  };
  console.log('[Commission] Saving settings:', payload);
  // Future: POST to API
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
          <Percent class="text-emerald-600" :size="28" />
          Commission Settings
        </h1>
        <p class="text-sm text-gray-500 mt-1">Set revenue share % for each level.</p>
      </div>

      <div class="flex items-center gap-3">
        <button
          @click="saveCommissionSettings"
          class="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-5 py-2 font-medium transition shadow-sm"
        >
          <Save :size="18" />
          Save
        </button>
      </div>
    </div>

    <!-- ================================ -->
    <!-- CONTENT PANEL                    -->
    <!-- ================================ -->
    <div class="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">

      <!-- Section Heading -->
      <h2 class="text-base font-bold text-slate-900">Revenue Sharing Tiers</h2>
      <p class="text-sm text-gray-500 mb-6">Each recycling submission generates commission for up to 3 levels.</p>

      <!-- Tier Cards -->
      <div class="space-y-4">
        <div
          v-for="tier in commissionTiers"
          :key="tier.level"
          class="bg-slate-50/50 border border-slate-100 rounded-xl p-5 flex items-center justify-between gap-4"
        >
          <!-- LEFT: Icon + Metadata -->
          <div class="flex items-center gap-4">
            <!-- Icon Decorator -->
            <div class="h-10 w-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
              <Percent :size="18" />
            </div>

            <!-- Titles -->
            <div>
              <p class="text-sm font-bold text-gray-900">{{ tier.name }}</p>
              <p class="text-xs text-gray-500">{{ tier.type }}</p>
            </div>
          </div>

          <!-- RIGHT: Input + % -->
          <div class="flex items-center gap-2">
            <input
              v-model.number="tier.value"
              type="number"
              min="0"
              max="100"
              class="w-16 text-center border border-gray-200 rounded-lg py-2 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 font-semibold text-gray-800 text-sm"
            />
            <span class="text-sm text-gray-500 font-medium">%</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
