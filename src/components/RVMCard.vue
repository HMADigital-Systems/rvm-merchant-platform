<template>
  <div class="bg-white rounded-2xl shadow-sm overflow-hidden w-80 flex-shrink-0 mx-2 hover:shadow-lg transition border border-gray-100">
    
    <div class="relative">
      <img :src="image" alt="RVM Machine" class="w-full h-36 object-cover" />
      
      <span class="absolute top-2 right-2 text-white text-xs px-3 py-1 rounded-md font-medium shadow-sm"
        :class="{
            'bg-green-500': status === 'Online',
            'bg-red-500': status === 'Bin Full' || status === 'Maintenance',
            'bg-gray-500': status === 'Offline'
        }">
        {{ translateStatus(status) }}
      </span>
    </div>

    <div class="p-4">
      <div class="flex justify-between items-start text-gray-700 mb-3">
        <p class="font-semibold text-sm leading-tight flex-1 pr-2">{{ address }}</p>
        <div class="flex items-center text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0">
            📍 {{ distance }} km
        </div>
      </div>

      <div class="space-y-3 mt-4">
        <div v-for="(item, i) in compartments" :key="i" class="bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
          
          <div class="flex justify-between items-center mb-1">
            <div class="flex items-center space-x-2">
              <div class="w-2 h-2 rounded-full" 
                :class="{
                  'bg-green-500': item.color === 'green',
                  'bg-orange-500': item.color === 'orange',
                  'bg-blue-500': item.color === 'blue'
                }"></div>
              <span class="text-xs font-semibold text-gray-700">{{ translateWaste(item.label) }}</span>
            </div>

            <span class="text-xs font-bold uppercase tracking-wide"
              :class="{
                'text-green-600': item.statusColor === 'green',
                'text-red-500': item.statusColor === 'red',
                'text-orange-500': item.statusColor === 'orange'
              }">
              {{ translateState(item.statusText) }} ({{ item.percent }}%)
            </span>
          </div>

          <div class="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500"
              :class="{
                'bg-green-500': item.percent < 80,
                'bg-orange-500': item.percent >= 80 && item.percent < 95,
                'bg-red-500': item.percent >= 95
              }"
              :style="{ width: item.percent + '%' }">
            </div>
          </div>

        </div>
      </div>

      <p class="mt-4 text-[10px] text-gray-400 font-mono text-center">ID: {{ deviceNo }}</p>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps({
  image: { type: String, default: "https://lassification.oss-cn-shenzhen.aliyuncs.com/static/mini/imgv2/cb83c4f1-6d9b-4455-a994-01f53b08c9ba.jpg" },
  status: String,
  deviceNo: String,
  distance: [Number, String],
  address: String,
  compartments: Array, 
});

// 1. Translate Machine Status (Online, Maintenance, etc)
const translateStatus = (status) => {
  if (!status) return "";
  const key = status.toLowerCase().replace(/\s+/g, '_'); // "Bin Full" -> "bin_full"
  return t(`rvm.status.${key}`);
};

// 2. Translate Waste Name (Paper, UCO, etc) - Same logic as Dashboard
const translateWaste = (name) => {
  if (!name) return "";
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const translated = t(`waste.${key}`);
  return translated.includes('waste.') ? name : translated;
};

// 3. Translate Compartment State (Available, Bin Full)
const translateState = (state) => {
  if (!state) return "";
  const key = state.toLowerCase().replace(/\s+/g, '_'); // "Available" -> "available"
  return t(`rvm.state.${key}`);
};
</script>