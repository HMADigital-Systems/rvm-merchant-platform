<template>
  <div class="min-h-screen flex flex-col justify-center items-center bg-gray-50 px-6">
    <div class="bg-white shadow-lg rounded-2xl p-8 w-full max-w-md text-center">
      
      <h2 class="text-2xl font-semibold text-gray-800 mb-2">{{ t('phone.title') }}</h2>
      <p class="text-sm text-gray-500 mb-6">{{ t('phone.subtitle') }}</p>

      <div>
        <label class="block text-sm text-gray-600 mb-1">{{ t('phone.label') }}</label>
        <div class="flex items-center border rounded-lg overflow-hidden">
          <span class="bg-gray-100 px-3 text-gray-700 text-sm">+60</span>
          <input v-model="phone" type="tel" placeholder="12 345 6789"
                 class="flex-1 p-2 outline-none" />
        </div>
      </div>

      <button @click="sendOTP" 
        class="w-full mt-6 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition">
        {{ t('phone.button_send') }}
      </button>

      <div id="recaptcha-container"></div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import { auth, RecaptchaVerifier, signInWithPhoneNumber } from "../firebase.js";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const router = useRouter();
const phone = ref("");

// Note: We do not need 'let verifier = null' here. We use window.recaptchaVerifier directly.

onMounted(async () => {
  await nextTick();
  // Clear existing instance if any to prevent duplicates on re-mount
  if (window.recaptchaVerifier) {
    window.recaptchaVerifier.clear();
    window.recaptchaVerifier = null;
  }

  // Initialize reCAPTCHA
  window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
    size: "invisible",
    callback: (response) => {
      // reCAPTCHA solved
      console.log("reCAPTCHA solved:", response);
    },
    "expired-callback": () => {
      console.log("reCAPTCHA expired");
    }
  });

  // Render explicitly to catch initialization errors early
  try {
    await window.recaptchaVerifier.render();
    console.log("reCAPTCHA rendered successfully");
  } catch (e) {
    console.error("reCAPTCHA render error:", e);
  }
});

const sendOTP = async () => {
  if (!phone.value) {
    alert("Please enter a phone number");
    return;
  }

  // Ensure phone number has no spaces
  const cleanPhone = phone.value.replace(/\s+/g, '');
  const fullPhone = "+60" + cleanPhone;
  console.log("📤 Sending OTP to:", fullPhone);

  // ⭐ CRITICAL FIX: Use window.recaptchaVerifier here
  const appVerifier = window.recaptchaVerifier;

  if (!appVerifier) {
    alert("reCAPTCHA not initialized. Please refresh the page.");
    return;
  }

  try {
    const confirmation = await signInWithPhoneNumber(auth, fullPhone, appVerifier);

    window.confirmationResult = confirmation;
    localStorage.setItem("pendingPhone", fullPhone);

    console.log("✅ OTP sent");
    router.push("/enter-otp");

  } catch (err) {
    console.error("❌ OTP error:", err);
    // Reload captcha if it failed
    if (window.recaptchaVerifier) {
        window.recaptchaVerifier.render().then(widgetId => {
            grecaptcha.reset(widgetId);
        });
    }
    alert("Failed to send OTP: " + err.message);
  }
};
</script>