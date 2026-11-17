import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type {
  CashflowWithBalance,
  ProductBreakdownRow,
  SalesOrder,
} from '../types/dshyt';
import { formatWIB } from './ledger';

function sanitizeCloneForCanvas(clonedDoc: Document): void {
  // Remove Tailwind v4 stylesheets containing oklch()/oklab() so html2canvas never throws
  const styles = Array.from(clonedDoc.querySelectorAll('style'));
  for (const styleEl of styles) {
    styleEl.remove();
  }
  const links = Array.from(clonedDoc.querySelectorAll('link[rel="stylesheet"]'));
  for (const linkEl of links) {
    const href = linkEl.getAttribute('href') || '';
    if (!href.includes('fonts.googleapis.com')) {
      linkEl.remove();
    }
  }
  clonedDoc.body.style.backgroundColor = '#ffffff';
  clonedDoc.body.style.color = '#1a1614';
  clonedDoc.body.style.margin = '0';
}

async function captureInvoiceCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  return html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    onclone: (clonedDoc) => {
      sanitizeCloneForCanvas(clonedDoc);
    },
  });
}

export async function exportInvoiceToPNG(
  element: HTMLElement,
  orderId: string
): Promise<void> {
  const canvas = await captureInvoiceCanvas(element);
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const cleanId = orderId.replace(/[^a-zA-Z0-9_-]/g, '');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `Nota-${cleanId}-Kopi-DSHYT.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function exportInvoiceToPDF(
  element: HTMLElement,
  orderId: string,
  paperFormat: 'thermal' | 'a5'
): Promise<void> {
  const canvas = await captureInvoiceCanvas(element);
  const imgData = canvas.toDataURL('image/png', 1.0);
  const cleanId = orderId.replace(/[^a-zA-Z0-9_-]/g, '');

  if (paperFormat === 'thermal') {
    const paperWidthMm = 80;
    const marginMm = 4;
    const renderWidthMm = paperWidthMm - marginMm * 2;
    const renderHeightMm = (canvas.height * renderWidthMm) / canvas.width;
    const paperHeightMm = Math.max(120, Math.ceil(renderHeightMm + marginMm * 2));

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [paperWidthMm, paperHeightMm],
    });
    pdf.addImage(imgData, 'PNG', marginMm, marginMm, renderWidthMm, renderHeightMm);
    pdf.save(`Nota-Thermal-${cleanId}-Kopi-DSHYT.pdf`);
    return;
  }

  // A5 Portrait (148mm x 210mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - 20;
  const maxHeight = pageHeight - 20;

  let renderWidth = maxWidth;
  let renderHeight = (canvas.height * renderWidth) / canvas.width;
  if (renderHeight > maxHeight) {
    renderHeight = maxHeight;
    renderWidth = (canvas.width * renderHeight) / canvas.height;
  }

  const offsetX = (pageWidth - renderWidth) / 2;
  const offsetY = 10;
  pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderWidth, renderHeight);
  pdf.save(`Nota-A5-${cleanId}-Kopi-DSHYT.pdf`);
}

function escapeCSV(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportSalesToCSV(orders: SalesOrder[]): void {
  const headers = [
    'ID Order',
    'Tanggal (WIB)',
    'Nama Pembeli',
    'No. WhatsApp',
    'Metode Pengiriman',
    'Lokasi',
    'Metode Pembayaran',
    'Status Pembayaran',
    'Rincian Varian & Qty',
    'Total Unit',
    'Subtotal Menu (IDR)',
    'Ongkos Kirim (IDR)',
    'Diskon (IDR)',
    'Total Bayar (IDR)',
  ];

  const rows = orders.map((order) => {
    const itemDesc = order.items
      .map((i) => `${i.qty}x ${i.name}${i.extraShot ? ' (+Extra Shot)' : ''}`)
      .join('; ');
    const totalQty = order.items.reduce((sum, i) => sum + i.qty, 0);
    return [
      order.id,
      formatWIB(order.createdAt),
      order.customerName,
      order.whatsapp,
      order.deliveryMethod,
      order.locationDetail,
      order.paymentMethod,
      order.paymentStatus,
      itemDesc,
      totalQty,
      order.itemsSubtotal,
      order.shippingFee,
      order.discount,
      order.totalAmount,
    ]
      .map(escapeCSV)
      .join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Rekap-Penjualan-Kopi-DSHYT-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportWorkbookToXLSX(
  orders: SalesOrder[],
  breakdown: ProductBreakdownRow[],
  cashflow: CashflowWithBalance[]
): void {
  const wb = XLSX.utils.book_new();

  const salesRows = orders.map((order) => ({
    'ID Order': order.id,
    'Tanggal (WIB)': formatWIB(order.createdAt),
    'Nama Pembeli': order.customerName,
    'No. WhatsApp': order.whatsapp,
    'Metode Pengiriman': order.deliveryMethod,
    Lokasi: order.locationDetail,
    'Metode Bayar': order.paymentMethod,
    'Status Bayar': order.paymentStatus,
    'Varian Produk': order.items
      .map((i) => `${i.qty}x ${i.name}${i.extraShot ? ' (+Extra Shot)' : ''}`)
      .join('; '),
    'Total Qty': order.items.reduce((sum, i) => sum + i.qty, 0),
    'Subtotal Menu': order.itemsSubtotal,
    Ongkir: order.shippingFee,
    Diskon: order.discount,
    'Total Harga': order.totalAmount,
  }));

  const productRows = breakdown.map((row) => ({
    SKU: row.name,
    Kategori: row.category,
    'Harga Satuan': row.unitPrice,
    'Unit Terjual': row.unitsSold,
    'Jumlah Pesanan': row.orderCount,
    'Total Pendapatan': row.totalRevenue,
    'Kontribusi Omzet (%)': row.revenueSharePct,
  }));

  const cashflowRows = cashflow.map((entry) => ({
    'ID Transaksi': entry.id,
    'Tanggal (WIB)': formatWIB(entry.date),
    Jenis: entry.direction === 'Masuk' ? 'Kas Masuk' : 'Kas Keluar',
    Kategori: entry.category,
    Deskripsi: entry.description,
    Nominal: entry.direction === 'Masuk' ? entry.amount : -entry.amount,
    'Saldo Berjalan': entry.runningBalance,
  }));

  const wsSales = XLSX.utils.json_to_sheet(salesRows);
  wsSales['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 20 },
    { wch: 15 },
    { wch: 26 },
    { wch: 28 },
    { wch: 14 },
    { wch: 12 },
    { wch: 36 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];

  const wsProducts = XLSX.utils.json_to_sheet(productRows);
  wsProducts['!cols'] = [
    { wch: 26 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 20 },
  ];

  const wsCashflow = XLSX.utils.json_to_sheet(cashflowRows);
  wsCashflow['!cols'] = [
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 20 },
    { wch: 44 },
    { wch: 16 },
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, wsSales, 'Rekap Penjualan');
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Analisis Produk');
  XLSX.utils.book_append_sheet(wb, wsCashflow, 'Arus Kas');

  XLSX.writeFile(wb, `Laporan-Kopi-DSHYT-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
