import * as XLSX from 'xlsx';

/**
 * Export data to Excel (.xlsx) file
 * @param data - Array of objects to export
 * @param filename - Filename without extension (e.g., "refresh_logs_2025-12-28")
 */
export function exportToExcel(data: any[], filename: string): void {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  try {
    // Create a new workbook
    const workbook = XLSX.utils.book_new();

    // Convert data to worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Auto-size columns
    const columnWidths: { wch: number }[] = [];
    const headers = Object.keys(data[0]);

    headers.forEach((header, colIndex) => {
      // Calculate max width for this column
      let maxWidth = header.length;
      data.forEach((row) => {
        const cellValue = String(row[header] || '');
        maxWidth = Math.max(maxWidth, cellValue.length);
      });
      // Cap at 50 characters
      columnWidths[colIndex] = { wch: Math.min(maxWidth + 2, 50) };
    });

    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

    // Generate Excel file and trigger download
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw new Error('Failed to export to Excel');
  }
}
