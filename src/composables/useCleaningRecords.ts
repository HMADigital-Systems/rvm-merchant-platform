// src/composables/useCleaningRecords.ts
// UPDATED: Now fetches ONLY collection_tasks (no more mixing with recycling submissions)
import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';

export interface CleaningRecord {
    id: string;
    device_no: string;
    waste_type: string;
    bag_weight_collected: number;
    cleaned_at: string;
    cleaner_name: string;
    status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'COLLECTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'CANCELLED';
    photo_url?: string;
    admin_note?: string;
    is_live?: boolean;
    phone?: string;
    source_type?: string;
    collector_id?: string;
    priority?: string;
    customer_address?: string;
    customer_phone?: string;
}

export function useCleaningRecords() {
    const records = ref<CleaningRecord[]>([]);
    const loading = ref(false);

    const fetchCleaningLogs = async () => {
        const auth = useAuthStore();
        
        if (auth.loading || !auth.role) {
            console.log("Collections: Waiting for auth/role...");
            return;
        }
        
        loading.value = true;
        try {
            console.log("Collections: Fetching collection_tasks...");
            
            // Try new collection_tasks table first
            const { data: tasksData, error: tasksError } = await supabase
                .from('collection_tasks')
                .select('*')
                .order('collected_at', { ascending: false, nullsFirst: false })
                .order('assigned_at', { ascending: false })
                .limit(200);

            if (tasksError) {
                console.log("Collections: collection_tasks not available, falling back to cleaning_records:", tasksError.message);
                return await fetchOldCleaningLogs();
            }
            
            records.value = (tasksData || []).map((r: any) => ({
                id: r.id,
                device_no: r.device_no || r.customer_address || '-',
                waste_type: r.waste_type || 'Mixed',
                bag_weight_collected: Number(r.bag_weight_collected || r.weight_kg || 0),
                cleaned_at: r.collected_at || r.assigned_at || r.verified_at,
                cleaner_name: r.collector_name || 'Unassigned',
                status: r.status || 'ASSIGNED',
                photo_url: (r.photo_urls || [])[0] || '',
                admin_note: r.admin_notes || r.notes,
                is_live: false,
                source_type: r.source_type || 'RVM',
                collector_id: r.collector_id,
                priority: r.priority,
                customer_address: r.customer_address,
                customer_phone: r.customer_phone
            }));

            console.log(`[Collections] Loaded ${records.value.length} collection tasks`);
            
        } catch (err) {
            console.error("Error fetching collection tasks:", err);
            await fetchOldCleaningLogs();
        } finally {
            loading.value = false;
        }
    };

    // Fallback: old cleaning_records table
    const fetchOldCleaningLogs = async () => {
        try {
            const { data: cleanData } = await supabase
                .from('cleaning_records')
                .select('*')
                .order('cleaned_at', { ascending: false })
                .limit(200);

            records.value = (cleanData || []).map((r: any) => ({
                id: r.id,
                device_no: r.device_no || '-',
                waste_type: r.waste_type || 'Mixed',
                bag_weight_collected: Number(r.bag_weight_collected || 0),
                cleaned_at: r.cleaned_at || r.created_at,
                cleaner_name: r.cleaner_name || 'System',
                status: r.status || 'VERIFIED',
                photo_url: r.photo_url,
                admin_note: r.admin_note,
                is_live: false,
                source_type: 'RVM'
            }));
        } catch (e) {
            console.error("Fallback failed:", e);
            records.value = [];
        }
    };

    const approveCleaning = async (id: string) => {
        // New table
        const { error } = await supabase
            .from('collection_tasks')
            .update({ status: 'VERIFIED', verified_at: new Date().toISOString() })
            .eq('id', id);
        
        if (error) {
            // Fallback: old cleaning_records
            const { error: oldErr } = await supabase
                .from('cleaning_records')
                .update({ status: 'VERIFIED' })
                .eq('id', id);
            if (!oldErr) await fetchCleaningLogs();
        } else {
            await fetchCleaningLogs();
        }
    };

    const rejectCleaning = async (id: string, reason: string) => {
        const { error } = await supabase
            .from('collection_tasks')
            .update({ status: 'REJECTED', admin_notes: reason })
            .eq('id', id);
        
        if (error) {
            const { error: oldErr } = await supabase
                .from('cleaning_records')
                .update({ status: 'REJECTED', admin_note: reason })
                .eq('id', id);
            if (!oldErr) await fetchCleaningLogs();
        } else {
            await fetchCleaningLogs();
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('en-MY', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return {
        records,
        loading,
        fetchCleaningLogs,
        approveCleaning,
        rejectCleaning,
        formatDate
    };
}
