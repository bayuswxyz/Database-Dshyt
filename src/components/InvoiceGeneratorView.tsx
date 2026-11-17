import { useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Search,
} from 'lucide-react';
import { EXTRA_SHOT_PRICE, STORE_INFO } from '../data/catalog';
import type { SalesOrder } from '../types/dshyt';
import { exportInvoiceToPDF, exportInvoiceToPNG } from '../utils/exportUtils';
import { buildWhatsAppInvoiceText, formatIDR, formatWIB } from '../utils/ledger';

interface InvoiceGeneratorViewProps {
  orders: SalesOrder[];
  selectedOrderId: string;
  onSelectOrderId: (orderId: string) => void;
  onUpdateOrderFinancials: (
    orderId: string,
    patch: { shippingFee: number; discount: number; invoiceNote: string }
  ) => void;
  onToggleStatus: (orderId: string) => void;
}

export function InvoiceGeneratorView({
  orders,
  selectedOrderId,
  onSelectOrderId,
  onUpdateOrderFinancials,
  onToggleStatus,
}: InvoiceGeneratorViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [paperFormat, setPaperFormat] = useState<'a5' | 'thermal'>('a5');
  const [isExporting, setIsExporting] = useState<'pdf' | 'png' | null>(null);
  const [exportMessage, setExportMessage] = useState('');
  const [copiedWA, setCopiedWA] = useState(false);

  const invoiceRef = useRef<HTMLDivElement>(null);

  const activeOrder = useMemo(() => {
    return orders.find((o) => o.id === selectedOrderId) || orders[0] || null;
  }, [orders, selectedOrderId]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.whatsapp.toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

  async function handleExportPNG() {
    if (!invoiceRef.current || !activeOrder) return;
    setIsExporting('png');
    setExportMessage('');
    try {
      await exportInvoiceToPNG(invoiceRef.current, activeOrder.id);
      setExportMessage(`Berhasil mengunduh PNG untuk ${activeOrder.id}.`);
    } catch {
      setExportMessage('Gagal membuat gambar PNG. Silakan coba lagi.');
    } finally {
      setIsExporting(null);
    }
  }

  async function handleExportPDF() {
    if (!invoiceRef.current || !activeOrder) return;
    setIsExporting('pdf');
    setExportMessage('');
    try {
      await exportInvoiceToPDF(invoiceRef.current, activeOrder.id, paperFormat);
      setExportMessage(
        `Berhasil mengunduh PDF (${paperFormat === 'thermal' ? 'Thermal 80mm' : 'A5'}) untuk ${activeOrder.id}.`
      );
    } catch {
      setExportMessage('Gagal membuat dokumen PDF. Silakan coba lagi.');
    } finally {
      setIsExporting(null);
    }
  }

  async function handleCopyWA() {
    if (!activeOrder) return;
    const text = buildWhatsAppInvoiceText(activeOrder);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWA(true);
      setTimeout(() => setCopiedWA(false), 2000);
    } catch {
      setExportMessage('Salin teks gagal; silakan salin manual dari nota.');
    }
  }

  if (!activeOrder) {
    return (
      <section className="bg-white border border-[#E8E2DA] rounded-xl p-12 text-center">
        <h1 className="font-display text-2xl font-bold text-[#1A1614]">
          Belum Ada Pesanan untuk Nota
        </h1>
        <p className="text-sm text-[#6E635C] mt-2">
          Catat pesanan pre-order terlebih dahulu untuk membuat nota digital PDF atau PNG.
        </p>
      </section>
    );
  }

  const isPaid = activeOrder.paymentStatus === 'Lunas';
  const invoiceWidthPx = paperFormat === 'thermal' ? 360 : 520;

  return (
    <section aria-labelledby="invoice-heading" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#8C3B19] tracking-wide">
            Generator Bukti Pembayaran · Thermal 80mm &amp; A5
          </p>
          <h1
            id="invoice-heading"
            className="font-display text-2xl sm:text-3xl font-bold text-[#1A1614] tracking-tight mt-1"
          >
            Generator Nota Digital
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleCopyWA}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-[#E2D9CE] hover:border-[#C2B5A6] text-xs font-semibold text-[#1A1614] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedWA ? (
              <Check className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-[#6E635C]" aria-hidden="true" />
            )}
            <span>{copiedWA ? 'Teks WA Tersalin' : 'Salin Teks WA'}</span>
          </button>

          <button
            type="button"
            disabled={isExporting !== null}
            onClick={handleExportPNG}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1A1614] hover:bg-[#332B27] disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isExporting === 'png' ? 'Memproses PNG...' : 'Unduh PNG'}</span>
          </button>

          <button
            type="button"
            disabled={isExporting !== null}
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#C2410C] hover:bg-[#A33609] disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isExporting === 'pdf' ? 'Memproses PDF...' : 'Unduh PDF'}</span>
          </button>
        </div>
      </div>

      {exportMessage && (
        <div
          role="status"
          className="flex items-center gap-2 text-xs font-medium text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg px-4 py-2.5"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{exportMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Order Picker + Invoice Adjustments */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-[#E8E2DA] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-[#1A1614]">
                Pilih Transaksi Order
              </h2>
              <span className="text-xs text-[#6E635C] font-mono tabular-nums">
                {filteredOrders.length} order
              </span>
            </div>

            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-[#8A7E75] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Cari order untuk nota"
                placeholder="Cari ID Order atau nama pembeli..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] placeholder:text-[#8A7E75] focus:outline-none focus:bg-white focus:border-[#C2410C]"
              />
            </div>

            <div className="max-h-[280px] overflow-y-auto divide-y divide-[#EFEAE2] border border-[#EFEAE2] rounded-lg">
              {filteredOrders.map((order) => {
                const isSelected = order.id === activeOrder.id;
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onSelectOrderId(order.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#FFF5EE]' : 'bg-white hover:bg-[#FAF8F5]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[#1A1614]">
                          {order.id}
                        </span>
                        <span className="text-xs font-medium text-[#1A1614] truncate">
                          {order.customerName}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6E635C] mt-0.5 truncate">
                        {order.items.length} varian · {order.paymentStatus}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-semibold text-[#1A1614] shrink-0">
                      {formatIDR(order.totalAmount)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-[#E8E2DA] rounded-xl p-4 space-y-4">
            <h2 className="font-display text-base font-bold text-[#1A1614]">
              Pengaturan Cetak &amp; Rincian Biaya
            </h2>

            <div>
              <span className="block text-xs font-semibold text-[#1A1614] mb-1.5">
                Format Layout Nota
              </span>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F3EFE9] rounded-lg">
                <button
                  type="button"
                  onClick={() => setPaperFormat('a5')}
                  className={`py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    paperFormat === 'a5'
                      ? 'bg-white text-[#1A1614] shadow-xs'
                      : 'text-[#6E635C] hover:text-[#1A1614]'
                  }`}
                >
                  Ringkas A5
                </button>
                <button
                  type="button"
                  onClick={() => setPaperFormat('thermal')}
                  className={`py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    paperFormat === 'thermal'
                      ? 'bg-white text-[#1A1614] shadow-xs'
                      : 'text-[#6E635C] hover:text-[#1A1614]'
                  }`}
                >
                  Thermal 80mm
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="inv-shipping"
                  className="block text-xs font-semibold text-[#1A1614] mb-1"
                >
                  Ongkos Kirim (Rp)
                </label>
                <input
                  id="inv-shipping"
                  type="number"
                  min={0}
                  step={500}
                  value={activeOrder.shippingFee}
                  onChange={(e) =>
                    onUpdateOrderFinancials(activeOrder.id, {
                      shippingFee: Math.max(0, Number(e.target.value) || 0),
                      discount: activeOrder.discount,
                      invoiceNote: activeOrder.invoiceNote || '',
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:bg-white focus:border-[#C2410C]"
                />
              </div>

              <div>
                <label
                  htmlFor="inv-discount"
                  className="block text-xs font-semibold text-[#1A1614] mb-1"
                >
                  Diskon (Rp)
                </label>
                <input
                  id="inv-discount"
                  type="number"
                  min={0}
                  step={500}
                  value={activeOrder.discount}
                  onChange={(e) =>
                    onUpdateOrderFinancials(activeOrder.id, {
                      shippingFee: activeOrder.shippingFee,
                      discount: Math.max(0, Number(e.target.value) || 0),
                      invoiceNote: activeOrder.invoiceNote || '',
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:bg-white focus:border-[#C2410C]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="inv-note"
                className="block text-xs font-semibold text-[#1A1614] mb-1"
              >
                Catatan Nota (Opsional)
              </label>
              <input
                id="inv-note"
                type="text"
                placeholder="Contoh: Pengiriman kloter sore jam 16.00 WIB"
                value={activeOrder.invoiceNote || ''}
                onChange={(e) =>
                  onUpdateOrderFinancials(activeOrder.id, {
                    shippingFee: activeOrder.shippingFee,
                    discount: activeOrder.discount,
                    invoiceNote: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:bg-white focus:border-[#C2410C]"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#EFEAE2]">
              <span className="text-xs font-medium text-[#6E635C]">
                Status Pembayaran Saat Ini
              </span>
              <button
                type="button"
                onClick={() => onToggleStatus(activeOrder.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md border cursor-pointer ${
                  isPaid
                    ? 'text-[#15803D] bg-[#F0FDF4] border-[#BBF7D0]'
                    : 'text-[#B45309] bg-[#FFFBEB] border-[#FDE68A]'
                }`}
              >
                {activeOrder.paymentStatus} (Klik untuk ubah)
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Pure Hex Inline-Styled Invoice Surface for Safe html2canvas + jsPDF Export */}
        <div className="lg:col-span-7 flex flex-col items-center bg-[#F3EFE9] border border-[#E8E2DA] rounded-xl p-5 sm:p-8 overflow-x-auto">
          <div className="flex items-center gap-2 text-xs text-[#6E635C] mb-4">
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              Pratinjau Nota ({paperFormat === 'thermal' ? 'Thermal 80mm' : 'Standar A5'}) · Siap
              Export PDF &amp; PNG
            </span>
          </div>

          <div
            id="invoice-capture-area"
            ref={invoiceRef}
            data-testid="invoice-preview"
            style={{
              width: `${invoiceWidthPx}px`,
              maxWidth: '100%',
              backgroundColor: '#ffffff',
              color: '#1a1614',
              border: '1px solid #dfd6cb',
              borderRadius: '8px',
              padding: paperFormat === 'thermal' ? '22px 18px' : '32px 28px',
              fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              position: 'relative',
              boxSizing: 'border-box',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '16px',
                borderBottom: '2px solid #1a1614',
                paddingBottom: '16px',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: '"Fraunces", Georgia, serif',
                    fontSize: paperFormat === 'thermal' ? '20px' : '24px',
                    fontWeight: 700,
                    color: '#1a1614',
                    lineHeight: 1.15,
                  }}
                >
                  {STORE_INFO.invoiceTitle}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: '#6e635c',
                    marginTop: '4px',
                    lineHeight: 1.4,
                    maxWidth: '280px',
                  }}
                >
                  {STORE_INFO.address}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: '#6e635c',
                    marginTop: '2px',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                >
                  WA Admin: {STORE_INFO.whatsapp} · IG: {STORE_INFO.instagram}
                </div>
              </div>

              {/* Status Stamp */}
              <div
                style={{
                  border: `2px solid ${isPaid ? '#15803d' : '#b45309'}`,
                  color: isPaid ? '#15803d' : '#b45309',
                  backgroundColor: isPaid ? '#f0fdf4' : '#fffbeb',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                }}
              >
                {isPaid ? 'LUNAS' : 'BELUM LUNAS'}
              </div>
            </div>

            {/* Metadata Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: paperFormat === 'thermal' ? '1fr' : '1fr 1fr',
                gap: '10px',
                padding: '14px 0',
                borderBottom: '1px dashed #d5cbc0',
                fontSize: '12px',
              }}
            >
              <div>
                <div style={{ color: '#6e635c', fontSize: '11px' }}>ID Order &amp; Waktu</div>
                <div
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 600,
                    color: '#1a1614',
                    marginTop: '2px',
                  }}
                >
                  {activeOrder.id}
                </div>
                <div style={{ color: '#6e635c', fontSize: '11px', marginTop: '2px' }}>
                  {formatWIB(activeOrder.createdAt)}
                </div>
              </div>

              <div>
                <div style={{ color: '#6e635c', fontSize: '11px' }}>Pelanggan &amp; Pengiriman</div>
                <div style={{ fontWeight: 600, color: '#1a1614', marginTop: '2px' }}>
                  {activeOrder.customerName} ({activeOrder.whatsapp})
                </div>
                <div style={{ color: '#6e635c', fontSize: '11px', marginTop: '2px' }}>
                  {activeOrder.deliveryMethod}
                  {activeOrder.locationDetail ? ` — ${activeOrder.locationDetail}` : ''}
                </div>
              </div>
            </div>

            {/* Itemized Table */}
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginTop: '12px',
                fontSize: '12px',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid #e8e2da',
                    color: '#6e635c',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                  }}
                >
                  <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 600 }}>Item</th>
                  <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 600 }}>Harga</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600 }}>
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeOrder.items.map((item) => {
                  const unitWithShot = item.unitPrice + (item.extraShot ? EXTRA_SHOT_PRICE : 0);
                  const customDetails: string[] = [];
                  if (item.extraShot) customDetails.push('+Extra Shot');
                  if (item.iceLevel !== 'Normal Ice') customDetails.push(item.iceLevel);
                  if (item.sugarLevel !== 'Normal Sugar') customDetails.push(item.sugarLevel);

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f3efe9' }}>
                      <td style={{ padding: '8px 4px 8px 0', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: '#1a1614' }}>{item.name}</div>
                        {customDetails.length > 0 && (
                          <div style={{ fontSize: '10px', color: '#8c3b19', marginTop: '2px' }}>
                            {customDetails.join(' · ')}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '8px 4px',
                          textAlign: 'center',
                          verticalAlign: 'top',
                          fontFamily: '"JetBrains Mono", monospace',
                        }}
                      >
                        {item.qty}
                      </td>
                      <td
                        style={{
                          padding: '8px 4px',
                          textAlign: 'right',
                          verticalAlign: 'top',
                          fontFamily: '"JetBrains Mono", monospace',
                          color: '#6e635c',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatIDR(unitWithShot)}
                      </td>
                      <td
                        style={{
                          padding: '8px 0 8px 4px',
                          textAlign: 'right',
                          verticalAlign: 'top',
                          fontFamily: '"JetBrains Mono", monospace',
                          fontWeight: 600,
                          color: '#1a1614',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatIDR(item.subtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Summary Totals */}
            <div
              style={{
                marginTop: '14px',
                paddingTop: '12px',
                borderTop: '1px dashed #d5cbc0',
                fontSize: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '5px',
                  color: '#6e635c',
                }}
              >
                <span>Subtotal Menu</span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  {formatIDR(activeOrder.itemsSubtotal)}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '5px',
                  color: '#6e635c',
                }}
              >
                <span>Biaya Pengiriman (Ongkir)</span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  {formatIDR(activeOrder.shippingFee)}
                </span>
              </div>

              {activeOrder.discount > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '5px',
                    color: '#15803d',
                  }}
                >
                  <span>Diskon</span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                    -{formatIDR(activeOrder.discount)}
                  </span>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '10px',
                  paddingTop: '10px',
                  borderTop: '2px solid #1a1614',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#1a1614',
                }}
              >
                <span>Total Bayar ({activeOrder.paymentMethod})</span>
                <span
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '16px',
                    color: '#c2410c',
                  }}
                >
                  {formatIDR(activeOrder.totalAmount)}
                </span>
              </div>
            </div>

            {activeOrder.invoiceNote && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '8px 10px',
                  backgroundColor: '#faf8f5',
                  border: '1px solid #e8e2da',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#6e635c',
                }}
              >
                <strong style={{ color: '#1a1614' }}>Catatan:</strong> {activeOrder.invoiceNote}
              </div>
            )}

            {/* Footer */}
            <div
              style={{
                marginTop: '18px',
                paddingTop: '12px',
                borderTop: '1px solid #efeae2',
                textAlign: 'center',
                fontSize: '11px',
                color: '#6e635c',
              }}
            >
              <div>{STORE_INFO.footerNote}</div>
              <div style={{ marginTop: '3px', fontSize: '10px', color: '#8a7e75' }}>
                Bukti transaksi resmi pre-order {STORE_INFO.invoiceTitle}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
