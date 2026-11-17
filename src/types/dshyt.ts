export type MenuCategory =
  | 'Espresso & Black'
  | 'Signature & Susu'
  | 'Citrus & Sparkling';

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  description: string;
  supportsEspressoShot: boolean;
  supportsIceSugar: boolean;
}

export type IceLevel = 'Normal Ice' | 'Less Ice' | 'No Ice';
export type SugarLevel = 'Normal Sugar' | 'Less Sugar' | 'No Sugar';

export interface OrderItem {
  id: string;
  skuId: string;
  name: string;
  category: MenuCategory;
  qty: number;
  unitPrice: number;
  extraShot: boolean;
  iceLevel: IceLevel;
  sugarLevel: SugarLevel;
  subtotal: number;
}

export type PaymentStatus = 'Lunas' | 'Pending';
export type PaymentMethod = 'Cash' | 'QR / QRIS';
export type DeliveryMethod =
  | 'Delivery — Area Kampus'
  | 'Delivery — Luar Kampus / Kos'
  | 'Ambil di Tempat (Pick-Up)';

export interface SalesOrder {
  id: string;
  createdAt: string;
  customerName: string;
  whatsapp: string;
  deliveryMethod: DeliveryMethod;
  locationDetail: string;
  courierNote: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  items: OrderItem[];
  itemsSubtotal: number;
  shippingFee: number;
  discount: number;
  totalAmount: number;
  invoiceNote?: string;
  sheetRowIndex?: number;
  sheetRawStatus?: string;
  source?: 'local' | 'sheets';
}

export type CashflowDirection = 'Masuk' | 'Keluar';
export type CashflowCategory =
  | 'Penjualan Pre-Order'
  | 'Bahan Baku'
  | 'Kemasan'
  | 'Operasional';

export interface CashflowEntry {
  id: string;
  date: string;
  direction: CashflowDirection;
  category: CashflowCategory;
  description: string;
  amount: number;
  linkedOrderId?: string;
}

export interface CashflowWithBalance extends CashflowEntry {
  runningBalance: number;
}

export interface ProductBreakdownRow {
  skuId: string;
  name: string;
  category: MenuCategory;
  unitPrice: number;
  unitsSold: number;
  totalRevenue: number;
  revenueSharePct: number;
  orderCount: number;
}

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
}

export interface ConnectedSpreadsheet {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetTitle: string;
  statusColumnLetter: string;
  lastSyncedAt?: string;
}

export type ActiveTab = 'sales' | 'products' | 'cashflow' | 'invoice';
