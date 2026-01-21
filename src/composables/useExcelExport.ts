import * as XLSX from 'xlsx';

export function useExcelExport() {

  // 1. Calculate Summary Stats for Visualization
  const generateSummary = (data: any[]) => {
    const totalCount = data.length;
    const totalAmount = data.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    
    // Group by status
    const statusCounts: Record<string, number> = {
      APPROVED: 0,
      PENDING: 0,
      REJECTED: 0,
      EXTERNAL_SYNC: 0
    };

    data.forEach(item => {
      const status = item.status || 'UNKNOWN';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return {
      totalCount,
      totalAmount,
      statusCounts
    };
  };

  // 2. Generate and Download Excel
  const downloadExcel = (data: any[], filename = 'export_data') => {
    // A. Prepare Data Row by Row
    const rows = data.map(item => ({
      'Date': new Date(item.created_at).toLocaleDateString(),
      'Time': new Date(item.created_at).toLocaleTimeString(),
      'User Name': item.users?.nickname || 'Guest',
      'Phone': item.users?.phone || '-',
      'Bank Name': item.bank_name || '-',
      'Account Number': item.account_number || '-',
      'Amount': Number(item.amount),
      'Status': item.status,
      'Admin Note': item.admin_note || ''
    }));

    // B. Create Workbook
    const wb = XLSX.utils.book_new();

    // --- Sheet 1: Detailed Data ---
    const wsDetails = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, wsDetails, "Withdrawal Details");

    // --- Sheet 2: Summary Data ---
    const summary = generateSummary(data);
    const summaryRows = [
      ['Summary Report', ''],
      ['Generated At', new Date().toLocaleString()],
      ['', ''],
      ['Total Requests', summary.totalCount],
      ['Total Amount', summary.totalAmount],
      ['', ''],
      ['Status Breakdown', 'Count'],
      ['Pending', summary.statusCounts.PENDING],
      ['Approved/Paid', summary.statusCounts.APPROVED],
      ['Rejected', summary.statusCounts.REJECTED],
      ['Migrated', summary.statusCounts.EXTERNAL_SYNC]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // C. Save File
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return { generateSummary, downloadExcel };
}