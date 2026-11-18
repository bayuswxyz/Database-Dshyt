import { EXTRA_SHOT_PRICE, MENU_CATALOG } from '../data/catalog';
import type {
  DeliveryMethod,
  DriveSpreadsheetFile,
  IceLevel,
  MenuItem,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  SalesOrder,
  SheetColumnIndices,
  SugarLevel,
} from '../types/dshyt';
import { calculateOrderItemSubtotal } from './ledger';

export const DEFAULT_SHEET_COLUMNS: SheetColumnIndices = {
  timestamp: 0,
  nama: 1,
  whatsapp: 2,
  pesanan: 3,
  total: 4,
  pengiriman: 5,
  alamat: 6,
  catatan: 7,
  metodeBayar: 8,
  statusBayar: 9,
  orderStatus: 12,
  hasOrderStatusHeader: false,
};

export function findBestMatchingSpreadsheet(
  files: DriveSpreadsheetFile[]
): DriveSpreadsheetFile | null {
  if (!files || files.length === 0) return null;
  const exactOrderDb = files.find((f) => {
    const name = f.name.toLowerCase();
    return (
      name.includes('database') &&
      (name.includes('shyt') || name.includes('pesanan') || name.includes('kopi'))
    );
  });
  if (exactOrderDb) return exactOrderDb;

  const brandMatch = files.find((f) => {
    const name = f.name.toLowerCase();
    return name.includes('shyt') || name.includes('pesanan');
  });
  if (brandMatch) return brandMatch;

  return files.length === 1 ? files[0] : null;
}

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) return trimmed;
  return null;
}

export function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result || 'J';
}

export function parseCSVText(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

export function parseSheetTimestampWIB(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    const hour = match[4].padStart(2, '0');
    const minute = match[5];
    const second = (match[6] || '00').padStart(2, '0');
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString();
}

export function formatTimestampForSheetWIB(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export function parseRupiahAmount(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return 0;
  return Number.parseInt(digits, 10) || 0;
}

export function normalizeWhatsApp(raw: string): string {
  const cleaned = raw.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return '-';
  if (cleaned.startsWith('8') && cleaned.length >= 9) {
    return `0${cleaned}`;
  }
  return cleaned;
}

function normalizeSkuKey(name: string): string {
  return name.toLowerCase().replace(/['’`\s-]/g, '');
}

function findMenuSku(rawName: string, catalog: MenuItem[]): MenuItem | undefined {
  const target = normalizeSkuKey(rawName);
  return catalog.find((sku) => normalizeSkuKey(sku.name) === target);
}

function parseDeliveryMethod(raw: string): DeliveryMethod {
  const lower = raw.toLowerCase();
  if (lower.includes('luar kampus')) return 'Delivery — Luar Kampus / Kos';
  if (lower.includes('ambil') || lower.includes('pick')) return 'Ambil di Tempat (Pick-Up)';
  return 'Delivery — Area Kampus';
}

export function serializeDeliveryMethodForSheet(method: DeliveryMethod): string {
  if (method === 'Delivery — Luar Kampus / Kos') return 'Delivery (Luar Kampus)';
  if (method === 'Ambil di Tempat (Pick-Up)') return 'Ambil di Tempat';
  return 'Delivery (Kampus)';
}

function parsePaymentMethod(raw: string): PaymentMethod {
  const lower = raw.toLowerCase();
  if (lower.includes('cash') || lower.includes('tunai')) return 'Cash';
  return 'QR / QRIS';
}

export function serializePaymentMethodForSheet(method: PaymentMethod): string {
  return method === 'Cash' ? 'Cash' : 'QR';
}

function parsePaymentStatus(raw: string): PaymentStatus {
  const lower = raw.trim().toLowerCase();
  if (lower === 'lunas' || lower === 'paid') return 'Lunas';
  return 'Pending';
}

export function serializePaymentStatusForSheet(
  status: PaymentStatus,
  paymentMethod: PaymentMethod
): string {
  if (status === 'Lunas') return 'Lunas';
  return paymentMethod === 'QR / QRIS' ? 'Menunggu Konfirmasi' : 'Pending';
}

export function parseOrderStatus(raw: string): OrderStatus {
  const lower = raw.trim().toLowerCase();
  if (
    lower === 'selesai' ||
    lower === 'done' ||
    lower === 'completed' ||
    lower === 'diambil' ||
    lower === 'terkirim'
  ) {
    return 'Selesai';
  }
  if (
    lower === 'proses' ||
    lower === 'diproses' ||
    lower === 'process' ||
    lower === 'processing' ||
    lower.includes('proses') ||
    lower.includes('buat')
  ) {
    return 'Proses';
  }
  return 'Diterima';
}

export function parseOrderItemsString(
  rawPesanan: string,
  orderIdPrefix: string,
  catalog: MenuItem[] = MENU_CATALOG
): { items: OrderItem[]; itemNotes: string[] } {
  const segments = rawPesanan
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  const items: OrderItem[] = [];
  const itemNotes: string[] = [];

  segments.forEach((segment, idx) => {
    const match = segment.match(/^(.+?)\s*\((\d+)x(?::\s*([^)]*))?\)$/i);
    const rawName = match ? match[1].trim() : segment.trim();
    const qty = match ? Math.max(1, Number.parseInt(match[2], 10) || 1) : 1;
    const detailText = match?.[3] || '';

    const matchedSku = findMenuSku(rawName, catalog);
    const unitPrice = matchedSku ? matchedSku.price : 12000;
    const extraShot = /extra\s*shot|\+shot/i.test(detailText);

    let iceLevel: IceLevel = 'Normal Ice';
    if (/no\s*ice/i.test(detailText)) iceLevel = 'No Ice';
    else if (/less\s*ice/i.test(detailText)) iceLevel = 'Less Ice';

    let sugarLevel: SugarLevel = 'Normal Sugar';
    if (/no\s*sugar/i.test(detailText)) sugarLevel = 'No Sugar';
    else if (/less\s*sugar/i.test(detailText)) sugarLevel = 'Less Sugar';

    const noteMatch = detailText.match(/Catatan:\s*([^|]+)$/i);
    if (noteMatch?.[1]?.trim()) {
      itemNotes.push(`${matchedSku?.name || rawName}: ${noteMatch[1].trim()}`);
    }

    items.push({
      id: `${orderIdPrefix}-item-${idx + 1}`,
      skuId: matchedSku ? matchedSku.id : normalizeSkuKey(rawName),
      name: matchedSku ? matchedSku.name : rawName,
      category: matchedSku ? matchedSku.category : 'Signature & Susu',
      qty,
      unitPrice,
      extraShot,
      iceLevel,
      sugarLevel,
      subtotal: calculateOrderItemSubtotal(unitPrice, qty, extraShot, EXTRA_SHOT_PRICE),
    });
  });

  return { items, itemNotes };
}

export interface ParsedSheetResult {
  orders: SalesOrder[];
  statusColumnLetter: string;
  orderStatusColumnLetter: string;
  hasOrderStatusHeader: boolean;
  columnIndices: SheetColumnIndices;
}

export function parseSheetValuesToOrders(
  values: string[][],
  catalog: MenuItem[] = MENU_CATALOG
): ParsedSheetResult {
  if (!values || values.length === 0) {
    return {
      orders: [],
      statusColumnLetter: 'J',
      orderStatusColumnLetter: 'M',
      hasOrderStatusHeader: false,
      columnIndices: DEFAULT_SHEET_COLUMNS,
    };
  }

  const header = values[0].map((h) => h.trim().toLowerCase());
  const detectedOrderStatusIdx = header.findIndex(
    (h) =>
      h.includes('status pemesanan') ||
      h.includes('status pesanan') ||
      h.includes('status order') ||
      h.includes('progres')
  );

  const colIdx = {
    timestamp: header.findIndex((h) => h.includes('timestamp') || h.includes('tanggal')),
    nama: header.findIndex((h) => h === 'nama' || h.includes('pembeli')),
    whatsapp: header.findIndex((h) => h.includes('whatsapp') || h.includes('wa')),
    pesanan: header.findIndex((h) => h.includes('pesanan') || h.includes('order')),
    total: header.findIndex((h) => h === 'total' || h.includes('harga')),
    pengiriman: header.findIndex((h) => h.includes('pengiriman')),
    alamat: header.findIndex((h) => h.includes('alamat') || h.includes('lokasi')),
    catatan: header.findIndex((h) => h === 'catatan'),
    metodeBayar: header.findIndex((h) => h.includes('metode')),
    statusBayar: header.findIndex((h) => h.includes('status pembayaran') || h === 'status'),
    orderStatus: detectedOrderStatusIdx,
  };

  const tsCol = colIdx.timestamp >= 0 ? colIdx.timestamp : 0;
  const namaCol = colIdx.nama >= 0 ? colIdx.nama : 1;
  const waCol = colIdx.whatsapp >= 0 ? colIdx.whatsapp : 2;
  const pesananCol = colIdx.pesanan >= 0 ? colIdx.pesanan : 3;
  const totalCol = colIdx.total >= 0 ? colIdx.total : 4;
  const pengirimanCol = colIdx.pengiriman >= 0 ? colIdx.pengiriman : 5;
  const alamatCol = colIdx.alamat >= 0 ? colIdx.alamat : 6;
  const catatanCol = colIdx.catatan >= 0 ? colIdx.catatan : 7;
  const metodeCol = colIdx.metodeBayar >= 0 ? colIdx.metodeBayar : 8;
  const statusCol = colIdx.statusBayar >= 0 ? colIdx.statusBayar : 9;
  const hasOrderStatusHeader = detectedOrderStatusIdx >= 0;
  const orderStatusCol = hasOrderStatusHeader
    ? detectedOrderStatusIdx
    : Math.max(12, header.length);

  const columnIndices: SheetColumnIndices = {
    timestamp: tsCol,
    nama: namaCol,
    whatsapp: waCol,
    pesanan: pesananCol,
    total: totalCol,
    pengiriman: pengirimanCol,
    alamat: alamatCol,
    catatan: catatanCol,
    metodeBayar: metodeCol,
    statusBayar: statusCol,
    orderStatus: orderStatusCol,
    hasOrderStatusHeader,
  };

  const parsedOrders: SalesOrder[] = [];
  let seq = 1;

  for (let r = 1; r < values.length; r += 1) {
    const row = values[r] || [];
    const rawTs = (row[tsCol] || '').trim();
    const rawNama = (row[namaCol] || '').trim();
    const rawPesanan = (row[pesananCol] || '').trim();

    // Skip template/validation rows (rows 2-3) and summary rows ("total batch 1")
    if (!rawTs || !rawNama || !rawPesanan) {
      continue;
    }
    if (/^total\b/i.test(rawPesanan) || /^total\b/i.test(rawNama)) {
      continue;
    }

    const orderId = `#DSHYT-${String(9000 + seq)}`;
    seq += 1;

    const { items, itemNotes } = parseOrderItemsString(rawPesanan, orderId, catalog);
    const itemsSubtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
    const sheetTotal = parseRupiahAmount(row[totalCol] || '');
    const totalAmount = sheetTotal > 0 ? sheetTotal : itemsSubtotal;
    const shippingFee = totalAmount > itemsSubtotal ? totalAmount - itemsSubtotal : 0;
    const discount = itemsSubtotal > totalAmount ? itemsSubtotal - totalAmount : 0;

    const rawAlamat = (row[alamatCol] || '').trim();
    const rawCatatan = (row[catatanCol] || '').trim();
    const cleanAlamat = rawAlamat === '-' ? '' : rawAlamat;
    const cleanCatatan = rawCatatan === '-' ? '' : rawCatatan;
    const combinedNote = [cleanCatatan, ...itemNotes].filter(Boolean).join(' · ');

    const paymentMethod = parsePaymentMethod(row[metodeCol] || '');
    const rawStatus = (row[statusCol] || '').trim();
    const paymentStatus = parsePaymentStatus(rawStatus);
    const rawOrderStatus = hasOrderStatusHeader ? (row[orderStatusCol] || '').trim() : '';
    const orderStatus = parseOrderStatus(rawOrderStatus);

    parsedOrders.push({
      id: orderId,
      createdAt: parseSheetTimestampWIB(rawTs),
      customerName: rawNama,
      whatsapp: normalizeWhatsApp(row[waCol] || ''),
      deliveryMethod: parseDeliveryMethod(row[pengirimanCol] || ''),
      locationDetail: cleanAlamat,
      courierNote: combinedNote,
      paymentMethod,
      paymentStatus,
      orderStatus,
      items,
      itemsSubtotal,
      shippingFee,
      discount,
      totalAmount,
      invoiceNote: combinedNote || undefined,
      sheetRowIndex: r + 1, // 1-based Google Sheets row index
      sheetRawStatus: rawStatus || serializePaymentStatusForSheet(paymentStatus, paymentMethod),
      sheetRawOrderStatus: rawOrderStatus || orderStatus,
      source: 'sheets',
    });
  }

  // Sort newest first for sales log UX while preserving sheetRowIndex for exact cell writes
  parsedOrders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    orders: parsedOrders,
    statusColumnLetter: columnIndexToLetter(statusCol),
    orderStatusColumnLetter: columnIndexToLetter(orderStatusCol),
    hasOrderStatusHeader,
    columnIndices,
  };
}

export function formatOrderItemsForSheet(items: OrderItem[]): string {
  return items
    .map((item) => {
      const parts: string[] = [item.iceLevel, item.sugarLevel];
      if (item.extraShot) parts.push('Extra Shot');
      return `${item.name} (${item.qty}x: ${parts.join(', ')})`;
    })
    .join(' | ');
}

export function serializeOrderToSheetRow(
  order: SalesOrder,
  colIndices: SheetColumnIndices = DEFAULT_SHEET_COLUMNS
): string[] {
  const pesananStr = formatOrderItemsForSheet(order.items);
  const waClean = order.whatsapp.replace(/^0/, '');
  const maxIdx = Math.max(12, colIndices.orderStatus);
  const row = new Array<string>(maxIdx + 1).fill('');

  row[colIndices.timestamp] = formatTimestampForSheetWIB(order.createdAt);
  row[colIndices.nama] = order.customerName;
  row[colIndices.whatsapp] = waClean;
  row[colIndices.pesanan] = pesananStr;
  row[colIndices.total] = `Rp${new Intl.NumberFormat('id-ID').format(order.totalAmount)}`;
  row[colIndices.pengiriman] = serializeDeliveryMethodForSheet(order.deliveryMethod);
  row[colIndices.alamat] = order.locationDetail || '-';
  row[colIndices.catatan] = order.courierNote || '-';
  row[colIndices.metodeBayar] = serializePaymentMethodForSheet(order.paymentMethod);
  row[colIndices.statusBayar] = serializePaymentStatusForSheet(
    order.paymentStatus,
    order.paymentMethod
  );
  if (row[10] === '') row[10] = '-';
  if (row[11] === '') row[11] = '-';
  row[colIndices.orderStatus] = order.orderStatus || 'Diterima';

  return row;
}

export interface SheetCellUpdate {
  rangeA1: string;
  values: string[][];
}

export function buildSheetRowUpdatePayload(
  order: SalesOrder,
  rowIndex: number,
  colIndices: SheetColumnIndices = DEFAULT_SHEET_COLUMNS
): SheetCellUpdate[] {
  const updates: SheetCellUpdate[] = [];
  const pesananStr = formatOrderItemsForSheet(order.items);
  const waClean = order.whatsapp.replace(/^0/, '');
  const totalStr = `Rp${new Intl.NumberFormat('id-ID').format(order.totalAmount)}`;
  const pengirimanStr = serializeDeliveryMethodForSheet(order.deliveryMethod);
  const alamatStr = order.locationDetail || '-';
  const catatanStr = order.courierNote || '-';
  const metodeStr = serializePaymentMethodForSheet(order.paymentMethod);
  const statusBayarStr = serializePaymentStatusForSheet(
    order.paymentStatus,
    order.paymentMethod
  );
  const orderStatusStr = order.orderStatus || 'Diterima';

  const isStandardContiguousAJ =
    colIndices.timestamp === 0 &&
    colIndices.nama === 1 &&
    colIndices.whatsapp === 2 &&
    colIndices.pesanan === 3 &&
    colIndices.total === 4 &&
    colIndices.pengiriman === 5 &&
    colIndices.alamat === 6 &&
    colIndices.catatan === 7 &&
    colIndices.metodeBayar === 8 &&
    colIndices.statusBayar === 9;

  if (isStandardContiguousAJ) {
    updates.push({
      rangeA1: `A${rowIndex}:J${rowIndex}`,
      values: [
        [
          formatTimestampForSheetWIB(order.createdAt),
          order.customerName,
          waClean,
          pesananStr,
          totalStr,
          pengirimanStr,
          alamatStr,
          catatanStr,
          metodeStr,
          statusBayarStr,
        ],
      ],
    });
  } else {
    const pairs: [number, string][] = [
      [colIndices.timestamp, formatTimestampForSheetWIB(order.createdAt)],
      [colIndices.nama, order.customerName],
      [colIndices.whatsapp, waClean],
      [colIndices.pesanan, pesananStr],
      [colIndices.total, totalStr],
      [colIndices.pengiriman, pengirimanStr],
      [colIndices.alamat, alamatStr],
      [colIndices.catatan, catatanStr],
      [colIndices.metodeBayar, metodeStr],
      [colIndices.statusBayar, statusBayarStr],
    ];
    for (const [cIdx, val] of pairs) {
      const colLetter = columnIndexToLetter(cIdx);
      updates.push({
        rangeA1: `${colLetter}${rowIndex}`,
        values: [[val]],
      });
    }
  }

  const orderStatusColLetter = columnIndexToLetter(colIndices.orderStatus);
  if (!colIndices.hasOrderStatusHeader) {
    updates.push({
      rangeA1: `${orderStatusColLetter}1`,
      values: [['Status Pemesanan']],
    });
  }
  updates.push({
    rangeA1: `${orderStatusColLetter}${rowIndex}`,
    values: [[orderStatusStr]],
  });

  return updates;
}
