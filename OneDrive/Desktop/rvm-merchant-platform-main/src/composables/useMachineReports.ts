import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import type { MachineReport, ReportType, ReportSeverity, ReportStatus } from '../types';

export function useMachineReports() {
  const loading = ref(false);
  const machineReports = ref<MachineReport[]>([]);

  // Fetch reports based on user role
  // - AGENT: sees their own reports + all pending critical reports
  // - SUPER_ADMIN: sees all pending reports
  // - ADMIN: sees reports for their merchant
  const fetchMachineReports = async () => {
    const auth = useAuthStore();
    loading.value = true;

    try {
      let query = supabase
        .from('machine_reports')
        .select(`
          *,
          machines (
            name,
            address
          )
        `)
        .order('created_at', { ascending: false });

      // Filter based on role
      if (auth.role === 'AGENT') {
        // Agents see their own reports and all pending critical reports
        // Show all pending critical reports that are not resolved
        query = query
          .eq('status', 'PENDING')
          .or('reported_by_admin_id.eq.' + auth.user?.id)
          .limit(50);
      } else if (auth.role === 'SUPER_ADMIN') {
        // Super admins see all pending critical reports
        query = query
          .eq('status', 'PENDING')
          .limit(50);
      } else if (auth.merchantId) {
        // Admins see reports for their merchant
        query = query
          .eq('merchant_id', auth.merchantId)
          .eq('status', 'PENDING')
          .limit(50);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching machine reports:', error);
        return;
      }

      machineReports.value = data || [];
    } catch (err) {
      console.error('Error fetching machine reports:', err);
    } finally {
      loading.value = false;
    }
  };

  // Create a new machine report (from agent reporting an issue)
  const createMachineReport = async (
    machineId: number,
    deviceNo: string,
    reportType: ReportType,
    description: string,
    severity: ReportSeverity = 'critical'
  ): Promise<boolean> => {
    const auth = useAuthStore();

    try {
      // First get machine details
      const { data: machine, error: machineError } = await supabase
        .from('machines')
        .select('merchant_id')
        .eq('id', machineId)
        .single();

      if (machineError || !machine) {
        console.error('Error fetching machine:', machineError);
        return false;
      }

      const insertData = {
        machine_id: machineId,
        device_no: deviceNo,
        merchant_id: machine.merchant_id,
        report_type: reportType,
        severity: severity,
        description: description,
        status: 'PENDING' as ReportStatus,
        reported_by_admin_id: auth.user?.id,
        reported_by_name: auth.user?.email || 'Agent'
      };

      const { error } = await supabase
        .from('machine_reports')
        .insert(insertData);

      if (error) {
        console.error('Error creating machine report:', error);
        return false;
      }

      // Refresh the reports list
      await fetchMachineReports();
      return true;
    } catch (err) {
      console.error('Error creating machine report:', err);
      return false;
    }
  };

  // Update report status (acknowledge, resolve, dismiss)
  const updateReportStatus = async (
    reportId: string,
    newStatus: ReportStatus
  ): Promise<boolean> => {
    try {
      const updateData: any = {
        status: newStatus
      };

      if (newStatus === 'RESOLVED') {
        updateData.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('machine_reports')
        .update(updateData)
        .eq('id', reportId);

      if (error) {
        console.error('Error updating report status:', error);
        return false;
      }

      // Refresh the reports list
      await fetchMachineReports();
      return true;
    } catch (err) {
      console.error('Error updating report status:', err);
      return false;
    }
  };

  // Get count of pending critical reports (for badge display)
  const getPendingCriticalCount = async (): Promise<number> => {
    const auth = useAuthStore();

    try {
      let query = supabase
        .from('machine_reports')
        .select('id', { count: 'exact' })
        .eq('status', 'PENDING')
        .eq('severity', 'critical');

      if (auth.role === 'AGENT') {
        // Agents see their own reports + all pending critical
        query = query.or('reported_by_admin_id.eq.' + auth.user?.id);
      } else if (auth.merchantId) {
        query = query.eq('merchant_id', auth.merchantId);
      }

      const { count, error } = await query;

      if (error) {
        console.error('Error getting pending count:', error);
        return 0;
      }

      return count || 0;
    } catch (err) {
      console.error('Error getting pending count:', err);
      return 0;
    }
  };

  return {
    loading,
    machineReports,
    fetchMachineReports,
    createMachineReport,
    updateReportStatus,
    getPendingCriticalCount
  };
}
