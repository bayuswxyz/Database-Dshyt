import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  DeliveryMethod,
  OrderStatus,
  PaymentStatus,
  SalesOrder,
} from '../types/dshyt';
import { formatIDR, formatWIB, summarizeSales } from '../utils/ledger';

interface SalesLogViewProps {
  orders: SalesOrder[];
  onToggleStatus: (orderId: string) => void;
  onUpdateOrderStatus: (orderId: string, nextOrderStatus: OrderStatus) => void;
  onEditOrder: (order: SalesOrder) => void;
  onOpenInvoice: (orderId: string) => void;
  onDeleteOrder: (orderId: string) => void;
  onOpenNewOrder: () => void;
  onExportCSV: (filteredOrders: SalesOrder[]) => void;
  onExportXLSX: () => void;
}

function getOrderStatusSelectClasses(status: OrderStatus): string {
  if (status === 'Selesai') {
    return 'text-[#15803D] bg-[#F0FDF4] border-[#BBF7D0] hover:bg-[#DCFCE7]';
  }
  if (status === 'Proses') {
    return 'text-[#C2410C] bg-[#FFF7ED] border-[#FED7AA] hover:bg-[#FFEDD5]';
  }
  return 'text-[#1D4ED8] bg-[#EFF6FF] border-[#BFDBFE] hover:bg-[#DBEAFE]';
}

export function SalesLogView({
  orders,
  onToggleStatus,
  onUpdateOrderStatus,
  onEditOrder,
  onOpenInvoice,
  onDeleteOrder,
  onOpenNewOrder,
  onExportCSV,
  onExportXLSX,
}: SalesLogViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Semua' | PaymentStatus>('Semua');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'Semua' | OrderStatus>('Semua');
  const [deliveryFilter, setDeliveryFilter] = useState<'Semua' | DeliveryMethod>('Semua');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');

  const summary = useMemo(() => summarizeSales(orders), [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const todayWib = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
    }).format(new Date(nowMs));

    return orders.filter((order) => {
      if (statusFilter !== 'Semua' && order.paymentStatus !== statusFilter) {
        return false;
      }
      const effectiveOrderStatus = order.orderStatus || 'Diterima';
      if (orderStatusFilter !== 'Semua' && effectiveOrderStatus !== orderStatusFilter) {
        return false;
      }
      if (deliveryFilter !== 'Semua' && order.deliveryMethod !== deliveryFilter) {
        return false;
      }
      if (periodFilter === 'today') {
        const orderWib = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jakarta',
        }).format(new Date(order.createdAt));
        if (orderWib !== todayWib) return false;
      } else if (periodFilter === '7d') {
        if (nowMs - new Date(order.createdAt).getTime() > 7 * dayMs) return false;
      } else if (periodFilter === '30d') {
        if (nowMs - new Date(order.createdAt).getTime() > 30 * dayMs) return false;
      }
      if (!q) return true;
      const matchesId = order.id.toLowerCase().includes(q);
      const matchesBuyer = order.customerName.toLowerCase().includes(q);
      const matchesWa = order.whatsapp.toLowerCase().includes(q);
      const matchesItem = order.items.some((i) => i.name.toLowerCase().includes(q));
      return matchesId || matchesBuyer || matchesWa || matchesItem;
    });
  }, [orders, searchQuery, statusFilter, orderStatusFilter, deliveryFilter, periodFilter]);

  const filteredOmzet = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + o.totalAmount, 0),
    [filteredOrders]
  );

  return (
    <section aria-labelledby="sales-heading" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#8C3B19] tracking-wide">
            Pre-Order Kopi D'SHYT PWT · Rekapitulasi Transaksi
          </p>
          <h1
            id="sales-heading"
            className="font-display text-2xl sm:text-3xl font-bold text-[#1A1614] tracking-tight mt-1"
          >
            Rekap Data Penjualan
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onExportCSV(filteredOrders)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-[#E2D9CE] hover:border-[#C2B5A6] text-xs font-semibold text-[#1A1614] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#6E635C]" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onExportXLSX}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-[#E2D9CE] hover:border-[#C2B5A6] text-xs font-semibold text-[#1A1614] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
            <span>Export XLSX</span>
          </button>
        </div>
      </div>

      {/* 4-Column Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E8E2DA] rounded-xl p-4">
          <p className="text-xs font-medium text-[#6E635C]">Total Omzet Penjualan</p>
          <p
            data-testid="kpi-total-omzet"
            className="font-mono tabular-nums text-2xl font-semibold text-[#1A1614] mt-1.5"
          >
            {formatIDR(summary.totalOmzet)}
          </p>
          <p className="text-xs text-[#6E635C] mt-1 tabular-nums">
            {summary.totalOrders} transaksi · {summary.totalUnits} unit terjual
          </p>
        </div>

        <div className="bg-white border border-[#E8E2DA] rounded-xl p-4">
          <p className="text-xs font-medium text-[#6E635C]">Omzet Terkonfirmasi (Lunas)</p>
          <p
            data-testid="kpi-paid-omzet"
            className="font-mono tabular-nums text-2xl font-semibold text-[#15803D] mt-1.5"
          >
            {formatIDR(summary.paidOmzet)}
          </p>
          <p className="text-xs text-[#6E635C] mt-1 tabular-nums">
            {summary.paidCount} pesanan masuk arus kas
          </p>
        </div>

        <div className="bg-white border border-[#E8E2DA] rounded-xl p-4">
          <p className="text-xs font-medium text-[#6E635C]">Menunggu Pembayaran (Pending)</p>
          <p
            data-testid="kpi-pending-omzet"
            className="font-mono tabular-nums text-2xl font-semibold text-[#B45309] mt-1.5"
          >
            {formatIDR(summary.pendingOmzet)}
          </p>
          <p className="text-xs text-[#6E635C] mt-1 tabular-nums">
            {summary.pendingCount} pesanan belum lunas
          </p>
        </div>

        <div className="bg-white border border-[#E8E2DA] rounded-xl p-4">
          <p className="text-xs font-medium text-[#6E635C]">Rata-Rata Nilai Pesanan</p>
          <p className="font-mono tabular-nums text-2xl font-semibold text-[#1A1614] mt-1.5">
            {formatIDR(
              summary.totalOrders > 0 ? Math.round(summary.totalOmzet / summary.totalOrders) : 0
            )}
          </p>
          <p className="text-xs text-[#6E635C] mt-1 tabular-nums">
            {summary.diterimaCount} diterima · {summary.prosesCount} proses · {summary.selesaiCount}{' '}
            selesai
          </p>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-[#E8E2DA] rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="flex items-center gap-1 p-1 bg-[#F3EFE9] rounded-lg"
            role="group"
            aria-label="Filter status pembayaran"
          >
            {(['Semua', 'Lunas', 'Pending'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === status
                    ? 'bg-white text-[#1A1614] shadow-xs'
                    : 'text-[#6E635C] hover:text-[#1A1614]'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <label className="sr-only" htmlFor="order-status-filter">
            Filter status pemesanan
          </label>
          <select
            id="order-status-filter"
            value={orderStatusFilter}
            onChange={(e) =>
              setOrderStatusFilter(e.target.value as 'Semua' | OrderStatus)
            }
            className="px-3 py-2 text-xs font-medium bg-white border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:border-[#C2410C]"
          >
            <option value="Semua">Semua Progres ({summary.totalOrders})</option>
            <option value="Diterima">Diterima ({summary.diterimaCount})</option>
            <option value="Proses">Proses ({summary.prosesCount})</option>
            <option value="Selesai">Selesai ({summary.selesaiCount})</option>
          </select>

          <label className="sr-only" htmlFor="delivery-filter">
            Filter metode pengiriman
          </label>
          <select
            id="delivery-filter"
            value={deliveryFilter}
            onChange={(e) => setDeliveryFilter(e.target.value as 'Semua' | DeliveryMethod)}
            className="px-3 py-2 text-xs font-medium bg-white border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:border-[#C2410C]"
          >
            <option value="Semua">Semua Pengiriman</option>
            <option value="Delivery — Area Kampus">Delivery — Area Kampus</option>
            <option value="Delivery — Luar Kampus / Kos">Delivery — Luar Kampus / Kos</option>
            <option value="Ambil di Tempat (Pick-Up)">Ambil di Tempat (Pick-Up)</option>
          </select>

          <label className="sr-only" htmlFor="period-filter">
            Filter periode transaksi
          </label>
          <select
            id="period-filter"
            value={periodFilter}
            onChange={(e) =>
              setPeriodFilter(e.target.value as 'all' | 'today' | '7d' | '30d')
            }
            className="px-3 py-2 text-xs font-medium bg-white border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:border-[#C2410C]"
          >
            <option value="all">Semua Tanggal</option>
            <option value="today">Hari Ini (WIB)</option>
            <option value="7d">7 Hari Terakhir</option>
            <option value="30d">30 Hari Terakhir</option>
          </select>
        </div>

        <div className="flex items-center gap-3 w-full xl:w-auto">
          <div className="relative flex-1 xl:w-64">
            <Search
              className="w-4 h-4 text-[#8A7E75] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Cari transaksi penjualan"
              placeholder="Cari ID Order, pembeli, atau menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] placeholder:text-[#8A7E75] focus:outline-none focus:bg-white focus:border-[#C2410C]"
            />
          </div>
          <span className="text-xs text-[#6E635C] font-mono tabular-nums whitespace-nowrap hidden sm:inline">
            {filteredOrders.length} baris · {formatIDR(filteredOmzet)}
          </span>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white border border-[#E8E2DA] rounded-xl overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="font-display text-lg font-semibold text-[#1A1614]">
              Tidak ada transaksi yang cocok
            </p>
            <p className="text-sm text-[#6E635C] mt-1 max-w-md mx-auto">
              Ubah kata kunci pencarian atau filter status, atau catat pesanan pre-order baru.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              {(searchQuery ||
                statusFilter !== 'Semua' ||
                orderStatusFilter !== 'Semua' ||
                deliveryFilter !== 'Semua' ||
                periodFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('Semua');
                    setOrderStatusFilter('Semua');
                    setDeliveryFilter('Semua');
                    setPeriodFilter('all');
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-[#E2D9CE] text-[#1A1614] hover:bg-[#FAF8F5] cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
              <button
                type="button"
                onClick={onOpenNewOrder}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#C2410C] text-white hover:bg-[#A33609] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Catat Pesanan Pertama</span>
              </button>
            </div>
          </div>
        ) : (
          <div data-testid="sales-table-scroll" className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8E2DA] bg-[#FAF8F5] text-[11px] font-semibold text-[#6E635C] uppercase tracking-wider">
                  <th className="py-3 px-2.5">ID Order &amp; Tanggal</th>
                  <th className="py-3 px-2.5">Pembeli &amp; Pengiriman</th>
                  <th className="py-3 px-2.5">Varian Produk</th>
                  <th className="py-3 px-2 text-right">Qty</th>
                  <th className="py-3 px-2 text-right whitespace-nowrap">Harga Satuan</th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">Total Harga</th>
                  <th className="py-3 px-2 whitespace-nowrap">Status Pesanan</th>
                  <th className="py-3 px-2">Pembayaran</th>
                  <th className="py-3 px-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEAE2] text-sm">
                {filteredOrders.map((order) => {
                  const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
                  const isPaid = order.paymentStatus === 'Lunas';
                  const currentOrderStatus: OrderStatus = order.orderStatus || 'Diterima';

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-[#FAF8F5]/80 transition-colors align-top"
                    >
                      <td className="py-3 px-2.5 whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-[#1A1614]">
                          {order.id}
                        </div>
                        <div className="text-[11px] text-[#6E635C] mt-0.5 tabular-nums">
                          {formatWIB(order.createdAt)}
                        </div>
                        {order.sheetRowIndex && (
                          <div className="text-[11px] font-mono text-[#8C3B19] mt-0.5">
                            Sheet Baris #{order.sheetRowIndex}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-2.5 min-w-[140px] max-w-[195px]">
                        <div className="font-semibold text-xs sm:text-sm text-[#1A1614] truncate">
                          {order.customerName}
                        </div>
                        <div className="text-[11px] text-[#6E635C] mt-0.5 leading-snug">
                          {order.deliveryMethod} · {order.paymentMethod}
                        </div>
                        {order.locationDetail && (
                          <div className="text-[11px] text-[#8A7E75] truncate max-w-[180px]">
                            {order.locationDetail}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-2.5 min-w-[140px] max-w-[195px]">
                        <ul className="space-y-1">
                          {order.items.map((item) => (
                            <li key={item.id} className="text-xs text-[#1A1614] leading-snug">
                              <span className="font-mono font-medium">{item.qty}x</span>{' '}
                              <span className="font-medium">{item.name}</span>
                              {item.extraShot && (
                                <span className="text-[#8C3B19] ml-1">(+Shot)</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>

                      <td className="py-3 px-2 text-right font-mono tabular-nums text-xs text-[#1A1614] whitespace-nowrap">
                        {totalQty}
                      </td>

                      <td className="py-3 px-2 text-right font-mono tabular-nums text-xs text-[#6E635C] whitespace-nowrap">
                        <div className="space-y-1">
                          {order.items.map((item) => (
                            <div key={item.id}>
                              {formatIDR(item.unitPrice + (item.extraShot ? 3000 : 0))}
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-2.5 text-right whitespace-nowrap">
                        <div className="font-mono tabular-nums text-xs sm:text-sm font-semibold text-[#1A1614]">
                          {formatIDR(order.totalAmount)}
                        </div>
                        {(order.shippingFee > 0 || order.discount > 0) && (
                          <div className="text-[11px] text-[#6E635C] font-mono tabular-nums mt-0.5">
                            {order.shippingFee > 0 ? `+Ongkir ${formatIDR(order.shippingFee)}` : ''}
                            {order.shippingFee > 0 && order.discount > 0 ? ' · ' : ''}
                            {order.discount > 0 ? `-Disk ${formatIDR(order.discount)}` : ''}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-2 whitespace-nowrap">
                        <select
                          aria-label={`Status pemesanan ${order.id} (saat ini ${currentOrderStatus})`}
                          value={currentOrderStatus}
                          onChange={(e) =>
                            onUpdateOrderStatus(order.id, e.target.value as OrderStatus)
                          }
                          className={`text-xs font-semibold px-2 py-1 rounded-md border transition-colors cursor-pointer focus:outline-none ${getOrderStatusSelectClasses(
                            currentOrderStatus
                          )}`}
                        >
                          <option value="Diterima">Diterima</option>
                          <option value="Proses">Proses</option>
                          <option value="Selesai">Selesai</option>
                        </select>
                      </td>

                      <td className="py-3 px-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onToggleStatus(order.id)}
                          aria-label={`Ubah status pembayaran ${order.id} (saat ini ${order.paymentStatus})`}
                          title="Klik untuk ubah status Lunas / Pending"
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                            isPaid
                              ? 'text-[#15803D] bg-[#F0FDF4] border-[#BBF7D0] hover:bg-[#DCFCE7]'
                              : 'text-[#B45309] bg-[#FFFBEB] border-[#FDE68A] hover:bg-[#FEF3C7]'
                          }`}
                        >
                          {isPaid ? (
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>{order.paymentStatus}</span>
                        </button>
                      </td>

                      <td className="py-3 px-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onEditOrder(order)}
                            aria-label={`Edit pesanan ${order.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-[#1A1614] bg-white border border-[#E2D9CE] hover:border-[#C2410C] hover:text-[#C2410C] transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" aria-hidden="true" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenInvoice(order.id)}
                            aria-label={`Buat nota digital untuk ${order.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-[#1A1614] bg-[#FAF8F5] border border-[#E2D9CE] hover:border-[#C2410C] hover:text-[#C2410C] transition-colors cursor-pointer"
                          >
                            <FileText className="w-3 h-3" aria-hidden="true" />
                            <span>Nota</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteOrder(order.id)}
                            aria-label={`Hapus pesanan ${order.id}`}
                            className="p-1.5 rounded-md text-[#8A7E75] hover:text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
