<script setup lang='ts'>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { X, Camera, VideoOff } from 'lucide-vue-next';
import { Html5Qrcode } from 'html5-qrcode';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'scan', data: string): void;
}>();

const scannerId = 'qr-scanner-region';
const scanner = ref<Html5Qrcode | null>(null);
const isScanning = ref(false);
const hasPermission = ref<boolean | null>(null);
const permissionDenied = ref(false);

const requestCameraPermission = async (): Promise<MediaStream | null> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' } 
    });
    stream.getTracks().forEach(track => track.stop());
    hasPermission.value = true;
    permissionDenied.value = false;
    return stream;
  } catch (err: any) {
    console.warn('Camera permission denied:', err);
    hasPermission.value = false;
    permissionDenied.value = true;
    return null;
  }
};

const startScanner = async () => {
  const stream = await requestCameraPermission();
  if (!stream) return;

  if (!scanner.value) {
    scanner.value = new Html5Qrcode(scannerId);
  }

  try {
    await scanner.value.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 280, height: 280 },
        aspectRatio: 1.0
      },
      onScanSuccess,
      () => {}
    );
    isScanning.value = true;
  } catch (err: any) {
    console.error('Scanner error:', err);
    isScanning.value = false;
    if (err.toString().includes('Permission')) {
      permissionDenied.value = true;
    }
  }
};

const onScanSuccess = (decodedText: string) => {
  playBeep();
  vibrate();
  emit('scan', decodedText);
  stopScanner();
  emit('close');
};

const playBeep = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 1800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;
    
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 150);
  } catch (e) {
    console.warn('Beep sound failed:', e);
  }
};

const vibrate = () => {
  if (navigator.vibrate) {
    navigator.vibrate(200);
  }
};

const stopScanner = async () => {
  if (scanner.value && isScanning.value) {
    try {
      await scanner.value.stop();
      isScanning.value = false;
    } catch (e) {
      console.warn('Failed to stop scanner:', e);
    }
  }
};

const retryCamera = () => {
  permissionDenied.value = false;
  hasPermission.value = null;
  startScanner();
};

const closeModal = () => {
  stopScanner();
  emit('close');
};

watch(() => props.show, (newVal) => {
  if (newVal) {
    setTimeout(() => {
      requestCameraPermission().then(stream => {
        if (stream) startScanner();
      });
    }, 300);
  } else {
    stopScanner();
  }
});

onMounted(() => {
  if (props.show) {
    requestCameraPermission().then(stream => {
      if (stream) startScanner();
    });
  }
});

onUnmounted(() => {
  stopScanner();
});
</script>

<template>
  <Teleport to='body'>
    <div v-if='show' class='fixed inset-0 z-50 flex items-center justify-center p-4'>
      <div class='absolute inset-0 bg-black/80' @click='closeModal'></div>
      
      <div class='relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden'>
        <button 
          @click='closeModal'
          class='absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-900/60 text-white hover:bg-gray-900/80 transition backdrop-blur-sm'
        >
          <X :size='20' />
        </button>

        <div class='p-5'>
          <h3 class='text-xl font-bold text-gray-900 text-center mb-4 flex items-center justify-center gap-2'>
            <Camera :size='22' class='text-emerald-600' />
            Scan QR Code
          </h3>

          <!-- Permission Denied State -->
          <div v-if='permissionDenied' class='aspect-square rounded-2xl bg-gray-800 flex flex-col items-center justify-center p-6 text-center'>
            <div class='w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mb-4'>
              <VideoOff :size='32' class='text-gray-400' />
            </div>
            <h4 class='text-lg font-semibold text-white mb-2'>Camera Blocked</h4>
            <p class='text-sm text-gray-400 mb-6'>
              Please allow camera access to scan QR codes
            </p>
            <button 
              @click='retryCamera'
              class='px-6 py-3 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-100 transition flex items-center gap-2'
            >
              <Camera :size='18' />
              Re-enable Camera
            </button>
          </div>

          <!-- Camera Feed -->
          <div v-else class='relative rounded-2xl overflow-hidden bg-gray-900 aspect-square'>
            <div :id='scannerId' class='w-full h-full'></div>
            
            <!-- Bracket Viewfinder Overlay -->
            <div class='absolute inset-0 pointer-events-none'>
              <div class='absolute inset-0 flex items-center justify-center'>
                <div class='w-64 h-64 relative'>
                  <!-- Top Left Bracket -->
                  <div class='absolute top-0 left-0 w-16 h-16'>
                    <div class='absolute top-0 left-0 w-8 h-1 bg-white rounded-l'></div>
                    <div class='absolute top-0 left-0 w-1 h-8 bg-white rounded-t'></div>
                  </div>
                  <!-- Top Right Bracket -->
                  <div class='absolute top-0 right-0 w-16 h-16'>
                    <div class='absolute top-0 right-0 w-8 h-1 bg-white rounded-r'></div>
                    <div class='absolute top-0 right-0 w-1 h-8 bg-white rounded-t'></div>
                  </div>
                  <!-- Bottom Left Bracket -->
                  <div class='absolute bottom-0 left-0 w-16 h-16'>
                    <div class='absolute bottom-0 left-0 w-8 h-1 bg-white rounded-l'></div>
                    <div class='absolute bottom-0 left-0 w-1 h-8 bg-white rounded-b'></div>
                  </div>
                  <!-- Bottom Right Bracket -->
                  <div class='absolute bottom-0 right-0 w-16 h-16'>
                    <div class='absolute bottom-0 right-0 w-8 h-1 bg-white rounded-r'></div>
                    <div class='absolute bottom-0 right-0 w-1 h-8 bg-white rounded-b'></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class='absolute bottom-4 left-0 right-0 text-center'>
              <p class='text-white/90 text-sm bg-black/40 px-4 py-2 rounded-full inline-block backdrop-blur-sm'>
                Align QR code within the brackets
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
:deep(#qr-scanner-region video) {
  object-fit: cover !important;
  width: 100% !important;
  height: 100% !important;
}

:deep(#qr-scanner-region) {
  width: 100% !important;
  height: 100% !important;
}

:deep(#qr-scanner-region img) {
  display: none !important;
}
</style>