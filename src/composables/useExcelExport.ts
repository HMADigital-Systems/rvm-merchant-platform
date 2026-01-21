import * as XLSX from 'xlsx';

export type ExportMode = 'withdrawals' | 'cleaning';

export function useExcelExport() {

  // 1. Generic Summary Calculator
  const generateSummary = (data: any[], mode: ExportMode) => {
    const totalCount = data.length;
    let totalValue = 0; // Represents Amount (Points) OR Weight (KG)
    
    // Status counters
    const statusCounts: Record<string, number> = {};

    data.forEach(item => {
      // Summation Logic
      if (mode === 'withdrawals') {
        totalValue += Number(item.amount || 0);
      } else {
        totalValue += Number(item.bag_weight_collected || 0);
      }

      // Status Counting
      const status = item.status || 'UNKNOWN';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return { totalCount, totalValue, statusCounts };
  };

  // 2. Generic Excel Downloader
  const downloadExcel = (data: any[], mode: ExportMode) => {
    let filename = 'export';
    let rows: any[] = [];

    // A. Define Columns based on Mode
    if (mode === 'withdrawals') {
        filename = 'Withdrawals';
        rows = data.map(item => ({
            'Date': new Date(item.created_at).toLocaleDateString(),
            'Time': new Date(item.created_at).toLocaleTimeString(),
            'User': item.users?.nickname || 'Guest',
            'Phone': item.users?.phone || '-',
            'Bank': item.bank_name || '-',
            'Account': item.account_number || '-',
            'Amount (pts)': Number(item.amount),
            'Status': item.status,
            'Note': item.admin_note || ''
        }));
    } else {
        filename = 'CleaningLogs';
        rows = data.map(item => ({
            'Date': new Date(item.cleaned_at).toLocaleDateString(),
            'Time': new Date(item.cleaned_at).toLocaleTimeString(),
            'Machine ID': item.device_no,
            'Waste Type': item.waste_type,
            'Collected Weight (kg)': Number(item.bag_weight_collected),
            'Operator': item.cleaner_name || 'System',
            'Status': item.status,
            'Photo URL': item.photo_url || ''
        }));
    }

    // B. Create Workbook
    const wb = XLSX.utils.book_new();
    const wsDetails = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, wsDetails, "Details");

    // C. Create Summary Sheet
    const summary = generateSummary(data, mode);
    
    // Explicitly type the rows array as (string | number)[][]
    const summaryRows: (string | number)[][] = [
        ['Report Type', mode.toUpperCase()],
        ['Generated At', new Date().toLocaleString()],
        ['', ''],
        ['Total Records', summary.totalCount],
        [mode === 'withdrawals' ? 'Total Amount (pts)' : 'Total Weight (kg)', summary.totalValue.toFixed(2)],
        ['', ''],
        ['Status Breakdown', 'Count']
    ];

    Object.keys(summary.statusCounts).forEach(key => {
        // ✅ FIX: Ensure the value is treated as a number
        summaryRows.push([key, Number(summary.statusCounts[key])]);
    });

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return { generateSummary, downloadExcel };
}