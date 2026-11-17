import { EXTRA_SHOT_PRICE, STORE_INFO } from '../data/catalog';
import type {
  CashflowCategory,
  CashflowEntry,
  CashflowWithBalance,
  MenuItem,
  OrderItem,
  ProductBreakdownRow,
  SalesOrder,
} from '../types/dshyt';

export function formatIDR(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  const formatted = new Intl.NumberFormat('id-ID').format(abs);
  return `${sign}Rp ${formatted}`;
}

export function formatWIB(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const datePart = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace('.', ':');
  return `${datePart}, ${timePart} WIB`;
}

export function formatWIBDateOnly(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function calculateOrderItemSubtotal(
  unitPrice: number,
  qty: number,
  extraShot: boolean,
  extraShotPrice: number = EXTRA_SHOT_PRICE
): number {
  const safeQty = Math.max(0, Math.floor(qty));
  const effectiveUnit = Math.max(0, unitPrice) + (extraShot ? extraShotPrice : 0);
  return effectiveUnit * safeQty;
}

export function calculateOrderTotals(
  items: OrderItem[],
  shippingFee: number = 0,
  discount: number = 0
): { itemsSubtotal: number; totalAmount: number } {
  const itemsSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const safeShipping = Math.max(0, Math.round(shippingFee));
  const safeDiscount = Math.max(0, Math.round(discount));
  const totalAmount = Math.max(0, itemsSubtotal + safeShipping - safeDiscount);
  return { itemsSubtotal, totalAmount };
}

export interface SalesSummary {
  totalOmzet: number;
  paidOmzet: number;
  pendingOmzet: number;
  totalOrders: number;
  totalUnits: number;
  paidCount: number;
  pendingCount: number;
}

export function summarizeSales(orders: SalesOrder[]): SalesSummary {
  return orders.reduce<SalesSummary>(
    (acc, order) => {
      acc.totalOrders += 1;
      acc.totalOmzet += order.totalAmount;
      const unitsInOrder = order.items.reduce((sum, item) => sum + item.qty, 0);
      acc.totalUnits += unitsInOrder;
      if (order.paymentStatus === 'Lunas') {
        acc.paidOmzet += order.totalAmount;
        acc.paidCount += 1;
      } else {
        acc.pendingOmzet += order.totalAmount;
        acc.pendingCount += 1;
      }
      return acc;
    },
    {
      totalOmzet: 0,
      paidOmzet: 0,
      pendingOmzet: 0,
      totalOrders: 0,
      totalUnits: 0,
      paidCount: 0,
      pendingCount: 0,
    }
  );
}

export function computeProductBreakdown(
  orders: SalesOrder[],
  catalog: MenuItem[],
  onlyPaid: boolean = false
): ProductBreakdownRow[] {
  const filteredOrders = onlyPaid
    ? orders.filter((order) => order.paymentStatus === 'Lunas')
    : orders;

  const map = new Map<
    string,
    {
      skuId: string;
      name: string;
      category: MenuItem['category'];
      unitPrice: number;
      unitsSold: number;
      totalRevenue: number;
      orderIds: Set<string>;
    }
  >();

  for (const sku of catalog) {
    map.set(sku.id, {
      skuId: sku.id,
      name: sku.name,
      category: sku.category,
      unitPrice: sku.price,
      unitsSold: 0,
      totalRevenue: 0,
      orderIds: new Set<string>(),
    });
  }

  for (const order of filteredOrders) {
    for (const item of order.items) {
      const existing = map.get(item.skuId);
      if (existing) {
        existing.unitsSold += item.qty;
        existing.totalRevenue += item.subtotal;
        existing.orderIds.add(order.id);
      } else {
        map.set(item.skuId, {
          skuId: item.skuId,
          name: item.name,
          category: item.category,
          unitPrice: item.unitPrice,
          unitsSold: item.qty,
          totalRevenue: item.subtotal,
          orderIds: new Set<string>([order.id]),
        });
      }
    }
  }

  const rows = Array.from(map.values());
  const grandRevenue = rows.reduce((sum, r) => sum + r.totalRevenue, 0);

  return rows
    .map((row) => ({
      skuId: row.skuId,
      name: row.name,
      category: row.category,
      unitPrice: row.unitPrice,
      unitsSold: row.unitsSold,
      totalRevenue: row.totalRevenue,
      revenueSharePct:
        grandRevenue > 0 ? Math.round((row.totalRevenue / grandRevenue) * 1000) / 10 : 0,
      orderCount: row.orderIds.size,
    }))
    .sort((a, b) => {
      if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
      if (b.unitsSold !== a.unitsSold) return b.unitsSold - a.unitsSold;
      return a.name.localeCompare(b.name);
    });
}

export interface CashflowSummary {
  totalInflow: number;
  totalOutflow: number;
  netBalance: number;
  byCategory: Record<CashflowCategory, { inflow: number; outflow: number }>;
}

export function computeCashflowWithBalance(entries: CashflowEntry[]): {
  rows: CashflowWithBalance[];
  summary: CashflowSummary;
} {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let balance = 0;
  let totalInflow = 0;
  let totalOutflow = 0;

  const byCategory: Record<CashflowCategory, { inflow: number; outflow: number }> = {
    'Penjualan Pre-Order': { inflow: 0, outflow: 0 },
    'Bahan Baku': { inflow: 0, outflow: 0 },
    Kemasan: { inflow: 0, outflow: 0 },
    Operasional: { inflow: 0, outflow: 0 },
  };

  const rows: CashflowWithBalance[] = sorted.map((entry) => {
    const amt = Math.max(0, Math.round(entry.amount));
    if (entry.direction === 'Masuk') {
      balance += amt;
      totalInflow += amt;
      byCategory[entry.category].inflow += amt;
    } else {
      balance -= amt;
      totalOutflow += amt;
      byCategory[entry.category].outflow += amt;
    }
    return {
      ...entry,
      amount: amt,
      runningBalance: balance,
    };
  });

  return {
    rows,
    summary: {
      totalInflow,
      totalOutflow,
      netBalance: balance,
      byCategory,
    },
  };
}

export function syncOrderToCashflow(
  order: SalesOrder,
  existingEntries: CashflowEntry[]
): CashflowEntry[] {
  const existingIdx = existingEntries.findIndex(
    (entry) => entry.linkedOrderId === order.id
  );

  if (order.paymentStatus === 'Lunas') {
    const syncedEntry: CashflowEntry = {
      id: existingIdx >= 0 ? existingEntries[existingIdx].id : `CF-${order.id.replace('#', '')}`,
      date: order.createdAt,
      direction: 'Masuk',
      category: 'Penjualan Pre-Order',
      description: `Pembayaran Pre-Order ${order.id} — ${order.customerName} (${order.paymentMethod})`,
      amount: order.totalAmount,
      linkedOrderId: order.id,
    };

    if (existingIdx >= 0) {
      const next = [...existingEntries];
      next[existingIdx] = syncedEntry;
      return next;
    }
    return [...existingEntries, syncedEntry];
  }

  if (existingIdx >= 0) {
    return existingEntries.filter((entry) => entry.linkedOrderId !== order.id);
  }
  return existingEntries;
}

export function generateNextOrderId(orders: SalesOrder[]): string {
  let maxNum = 8821;
  for (const order of orders) {
    const match = order.id.match(/(\d+)$/);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }
  return `#DSHYT-${maxNum + 1}`;
}

export function buildWhatsAppInvoiceText(order: SalesOrder): string {
  const lines = [
    `*NOTA DIGITAL ${STORE_INFO.invoiceTitle}*`,
    `ID Order: ${order.id}`,
    `Tanggal: ${formatWIB(order.createdAt)}`,
    `Pembeli: ${order.customerName} (${order.whatsapp})`,
    `Pengiriman: ${order.deliveryMethod}${order.locationDetail ? ` — ${order.locationDetail}` : ''}`,
    `Status: *${order.paymentStatus.toUpperCase()}* (${order.paymentMethod})`,
    '',
    '*Rincian Pesanan:*',
    ...order.items.map((item) => {
      const customParts: string[] = [];
      if (item.extraShot) customParts.push('+Extra Shot');
      if (item.iceLevel !== 'Normal Ice') customParts.push(item.iceLevel);
      if (item.sugarLevel !== 'Normal Sugar') customParts.push(item.sugarLevel);
      const suffix = customParts.length > 0 ? ` (${customParts.join(', ')})` : '';
      return `• ${item.qty}x ${item.name}${suffix} = ${formatIDR(item.subtotal)}`;
    }),
    '',
    `Subtotal Menu: ${formatIDR(order.itemsSubtotal)}`,
    ...(order.shippingFee > 0 ? [`Ongkos Kirim: ${formatIDR(order.shippingFee)}`] : []),
    ...(order.discount > 0 ? [`Diskon: -${formatIDR(order.discount)}`] : []),
    `*Total Bayar: ${formatIDR(order.totalAmount)}*`,
    '',
    STORE_INFO.footerNote,
  ];
  return lines.join('\n');
}
