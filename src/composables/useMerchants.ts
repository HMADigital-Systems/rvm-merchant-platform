// src/composables/useMerchants.ts
import { ref } from 'vue';
import { supabase } from '../services/supabase';
import type { Merchant } from '../types'; // Ensure you have this type defined or define it locally

// Extend the interface to include what we need locally
export interface AdminMerchant extends Merchant {
  admin_count?: number;
  machines?: { device_no: string; name: string }[];
}

export function useMerchants() {
  const merchants = ref<AdminMerchant[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // 1. Fetch All Merchants
  const fetchMerchants = async () => {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('merchants')
        .select('*, app_admins(count), machines(device_no, name)')
        .order('created_at', { ascending: false });

      if (err) throw err;

      merchants.value = data.map((m: any) => ({
        ...m,
        admin_count: m.app_admins?.[0]?.count || 0,
        machines: m.machines || []
      }));
    } catch (err: any) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  };

  // 2. Create or Update Merchant
  const saveMerchant = async (form: any, isEditMode: boolean, merchantId?: string) => {
    loading.value = true;
    try {
      // A. Prepare Payload
      const payload = {
        name: form.name,
        currency_symbol: form.currency,
        rate_plastic: form.rate_plastic,
        rate_can: form.rate_can,
        rate_glass: form.rate_glass,
        is_active: form.is_active ?? true
      };

      let activeMerchantId = merchantId;

      if (isEditMode && merchantId) {
        // --- UPDATE MODE ---
        const { error: uError } = await supabase
          .from('merchants')
          .update(payload)
          .eq('id', merchantId);
        if (uError) throw uError;
      } else {
        // --- CREATE MODE ---
        const { data: mData, error: iError } = await supabase
          .from('merchants')
          .insert(payload)
          .select()
          .single();
        if (iError) throw iError;
        activeMerchantId = mData.id;

        // Create the Initial Admin for this new merchant
        if (form.adminEmail) {
          const { error: aError } = await supabase.from('app_admins').insert({
            email: form.adminEmail,
            role: 'SUPER_ADMIN',
            merchant_id: activeMerchantId
          });
          if (aError) throw aError;
        }
      }

      // B. Handle Machine Assignment (Add Only)
      // If the user entered machine IDs, we claim them for this merchant.
      if (form.assignedMachines && form.assignedMachines.length > 0 && activeMerchantId) {
        // Get list of device_nos to update
        const devicesToAssign = form.assignedMachines.split(',').map((s: string) => s.trim()).filter((s: string) => s);
        
        if (devicesToAssign.length > 0) {
            const { error: mError } = await supabase
              .from('machines')
              .update({ merchant_id: activeMerchantId })
              .in('device_no', devicesToAssign);
              
            if (mError) throw new Error("Merchant saved, but failed to assign machines: " + mError.message);
        }
      }

      await fetchMerchants();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message };
    } finally {
      loading.value = false;
    }
  };

  // 3. Toggle Status
  const toggleStatus = async (merchant: AdminMerchant) => {
    try {
      const newVal = !merchant.is_active;
      const { error: err } = await supabase
        .from('merchants')
        .update({ is_active: newVal })
        .eq('id', merchant.id);
      
      if (!err) merchant.is_active = newVal;
    } catch (e) {
      console.error(e);
    }
  };

  return { 
    merchants, 
    loading, 
    error,
    fetchMerchants, 
    saveMerchant, 
    toggleStatus 
  };
}