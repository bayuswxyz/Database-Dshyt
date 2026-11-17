import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { CashflowView } from './components/CashflowView';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { Header } from './components/Header';
import { InvoiceGeneratorView } from './components/InvoiceGeneratorView';
import { PreOrderModal } from './components/PreOrderModal';
import { ProductBreakdownView } from './components/ProductBreakdownView';
import { SalesLogView } from './components/SalesLogView';
import {
  SheetConfirmModal,
  type PendingSheetMutation,
} from './components/SheetConfirmModal';
import { MENU_CATALOG, SEED_CASHFLOW, SEED_ORDERS, STORE_INFO } from './data/catalog';
import type {
  ActiveTab,
  CashflowEntry,
  ConnectedSpreadsheet,
  SalesOrder,
} from './types/dshyt';
import { exportSalesToCSV, exportWorkbookToXLSX } from './utils/exportUtils';
import {
  clearAccessToken,
  getAccessToken,
  initGoogleAuth,
} from './utils/googleAuth';
import {
  appendSheetRow,
  readSheetValues,
  updateSheetCellValue,
} from './utils/googleSheetsApi';
import {
  calculateOrderTotals,
  computeCashflowWithBalance,
  computeProductBreakdown,
  formatWIB,
  generateNextOrderId,
  syncOrderToCashflow,
} from './utils/ledger';
import {
  parseCSVText,
  parseSheetValuesToOrders,
  serializeOrderToSheetRow,
  serializePaymentStatusForSheet,
} from './utils/sheetsParser';

const STORAGE_ORDERS_KEY = 'dshyt_sales_orders_v1';
const STORAGE_CASHFLOW_KEY = 'dshyt_cashflow_v1';
const STORAGE_SHEET_META_KEY = 'dshyt_connected_sheet_v1';
const ATTACHED_CSV_PATH =
  '/assets/aistudio/Database_Pesanan_Kopi_D_SHYT_d1296e85';

function loadInitialOrders(): SalesOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_ORDERS_KEY);
    if (!raw) return SEED_ORDERS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_ORDERS;
  } catch {
    return SEED_ORDERS;
  }
}

function loadInitialCashflow(): CashflowEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_CASHFLOW_KEY);
    if (!raw) return SEED_CASHFLOW;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_CASHFLOW;
  } catch {
    return SEED_CASHFLOW;
  }
}

function loadInitialSheetMeta(): ConnectedSpreadsheet | null {
  try {
    const raw = localStorage.getItem(STORAGE_SHEET_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConnectedSpreadsheet;
  } catch {
    return null;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('sales');
  const [orders, setOrders] = useState<SalesOrder[]>(loadInitialOrders);
  const [cashflowEntries, setCashflowEntries] =
    useState<CashflowEntry[]>(loadInitialCashflow);
  const [selectedInvoiceOrderId, setSelectedInvoiceOrderId] = useState<string>(
    () => loadInitialOrders()[0]?.id || ''
  );
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);

  // Google Workspace Auth & Sheets connection state (access token is NEVER persisted)
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [connectedSheet, setConnectedSheet] =
    useState<ConnectedSpreadsheet | null>(loadInitialSheetMeta);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isQuickSyncing, setIsQuickSyncing] = useState(false);
  const [syncBannerMsg, setSyncBannerMsg] = useState<string>('');
  const [syncBannerError, setSyncBannerError] = useState<string>('');

  // Mandatory explicit confirmation state before any mutating Sheets API call
  const [pendingMutation, setPendingMutation] =
    useState<PendingSheetMutation | null>(null);
  const [isMutationSubmitting, setIsMutationSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user) => {
        setGoogleUser(user);
        setHasAccessToken(true);
      },
      (user) => {
        setGoogleUser(user);
        setHasAccessToken(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(orders));
    } catch {
      // ignore quota errors
    }
  }, [orders]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CASHFLOW_KEY, JSON.stringify(cashflowEntries));
    } catch {
      // ignore quota errors
    }
  }, [cashflowEntries]);

  useEffect(() => {
    try {
      if (connectedSheet) {
        localStorage.setItem(
          STORAGE_SHEET_META_KEY,
          JSON.stringify(connectedSheet)
        );
      } else {
        localStorage.removeItem(STORAGE_SHEET_META_KEY);
      }
    } catch {
      // ignore
    }
  }, [connectedSheet]);

  const breakdown = useMemo(
    () => computeProductBreakdown(orders, MENU_CATALOG, false),
    [orders]
  );

  const cashflowWithBalance = useMemo(
    () => computeCashflowWithBalance(cashflowEntries).rows,
    [cashflowEntries]
  );

  function applyImportedOrders(importedOrders: SalesOrder[]) {
    setOrders(importedOrders);
    setSelectedInvoiceOrderId(importedOrders[0]?.id || '');

    setCashflowEntries((prev) => {
      // Keep manual cashflow entries (no linkedOrderId) and re-sync imported Lunas orders
      let next = prev.filter((entry) => !entry.linkedOrderId);
      for (const order of importedOrders) {
        next = syncOrderToCashflow(order, next);
      }
      return next;
    });
  }

  async function handleSyncFromGoogleSheet(
    spreadsheetId: string,
    spreadsheetTitle: string,
    sheetTitle: string
  ) {
    const token = getAccessToken();
    if (!token) {
      setHasAccessToken(false);
      setIsSheetsModalOpen(true);
      throw new Error('Silakan Sign in with Google terlebih dahulu.');
    }

    setSyncBannerError('');
    try {
      const values = await readSheetValues(token, spreadsheetId, sheetTitle);
      const { orders: parsedOrders, statusColumnLetter } =
        parseSheetValuesToOrders(values, MENU_CATALOG);

      if (parsedOrders.length === 0) {
        throw new Error(
          `Tab "${sheetTitle}" tidak memiliki baris pesanan yang dapat dibaca.`
        );
      }

      applyImportedOrders(parsedOrders);
      const nowIso = new Date().toISOString();
      setConnectedSheet({
        spreadsheetId,
        spreadsheetTitle,
        sheetTitle,
        statusColumnLetter,
        lastSyncedAt: nowIso,
      });
      setSyncBannerMsg(
        `${parsedOrders.length} pesanan berhasil disinkronkan dari "${spreadsheetTitle}" (${sheetTitle}).`
      );
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        clearAccessToken();
        setHasAccessToken(false);
      }
      throw err;
    }
  }

  async function handleQuickResync() {
    if (!connectedSheet) {
      setIsSheetsModalOpen(true);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setIsSheetsModalOpen(true);
      setSyncBannerError(
        'Sesi Google perlu diperbarui. Klik Sign in with Google untuk menarik ulang data.'
      );
      return;
    }

    setIsQuickSyncing(true);
    setSyncBannerError('');
    try {
      await handleSyncFromGoogleSheet(
        connectedSheet.spreadsheetId,
        connectedSheet.spreadsheetTitle,
        connectedSheet.sheetTitle
      );
    } catch (err) {
      setSyncBannerError(
        err instanceof Error ? err.message : 'Gagal menarik ulang Google Sheets.'
      );
    } finally {
      setIsQuickSyncing(false);
    }
  }

  async function handleLoadAttachedSnapshot() {
    setSyncBannerError('');
    const res = await fetch(ATTACHED_CSV_PATH);
    if (!res.ok) {
      throw new Error('Gagal membaca file snapshot Database_Pesanan_Kopi_D_SHYT.');
    }
    const csvText = await res.text();
    const values = parseCSVText(csvText);
    const { orders: parsedOrders } = parseSheetValuesToOrders(values, MENU_CATALOG);
    if (parsedOrders.length === 0) {
      throw new Error('Tidak ada baris pesanan ditemukan pada file snapshot.');
    }
    applyImportedOrders(parsedOrders);
    setSyncBannerMsg(
      `Berhasil memuat ${parsedOrders.length} pesanan dari snapshot Database_Pesanan_Kopi_D_SHYT.`
    );
    setIsSheetsModalOpen(false);
  }

  function applyLocalOrderCreation(
    orderInput: Omit<SalesOrder, 'id' | 'createdAt'>,
    openInvoiceAfter: boolean,
    sheetRowIndex?: number
  ) {
    const newId = generateNextOrderId(orders);
    const newOrder: SalesOrder = {
      ...orderInput,
      id: newId,
      createdAt: new Date().toISOString(),
      sheetRowIndex,
      source: sheetRowIndex ? 'sheets' : 'local',
    };

    setOrders((prev) => [newOrder, ...prev]);
    setCashflowEntries((prev) => syncOrderToCashflow(newOrder, prev));
    setSelectedInvoiceOrderId(newId);
    setIsNewOrderOpen(false);
    if (openInvoiceAfter) {
      setActiveTab('invoice');
    }
  }

  function handleCreateOrder(
    orderInput: Omit<SalesOrder, 'id' | 'createdAt'>,
    openInvoiceAfter: boolean
  ) {
    const token = getAccessToken();
    if (connectedSheet && token) {
      const previewOrder: SalesOrder = {
        ...orderInput,
        id: generateNextOrderId(orders),
        createdAt: new Date().toISOString(),
      };
      setPendingMutation({
        title: 'Tambahkan Pesanan ke Google Sheets?',
        description:
          'Spreadsheet Google Anda sedang terhubung. Konfirmasikan apakah pesanan baru ini ingin langsung ditambahkan sebagai baris baru ke Google Sheets.',
        targetSheet: `${connectedSheet.spreadsheetTitle} (${connectedSheet.sheetTitle})`,
        detailLine: `${previewOrder.customerName} — ${previewOrder.items.length} item (${previewOrder.paymentStatus})`,
        confirmLabel: 'Konfirmasi & Tambah ke Sheets',
        onConfirm: async () => {
          const rowValues = serializeOrderToSheetRow(previewOrder);
          await appendSheetRow(
            token,
            connectedSheet.spreadsheetId,
            connectedSheet.sheetTitle,
            rowValues
          );
          applyLocalOrderCreation(orderInput, openInvoiceAfter);
          setSyncBannerMsg(
            `Pesanan baru untuk ${previewOrder.customerName} berhasil ditambahkan ke Google Sheets.`
          );
        },
      });
      return;
    }

    applyLocalOrderCreation(orderInput, openInvoiceAfter);
  }

  function applyLocalStatusToggle(orderId: string) {
    let updatedOrder: SalesOrder | null = null;
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const nextStatus = order.paymentStatus === 'Lunas' ? 'Pending' : 'Lunas';
        updatedOrder = {
          ...order,
          paymentStatus: nextStatus,
          sheetRawStatus: serializePaymentStatusForSheet(
            nextStatus,
            order.paymentMethod
          ),
        };
        return updatedOrder;
      })
    );
    if (updatedOrder) {
      const synced = updatedOrder;
      setCashflowEntries((prev) => syncOrderToCashflow(synced, prev));
    }
  }

  function handleToggleStatus(orderId: string) {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    const nextStatus = targetOrder.paymentStatus === 'Lunas' ? 'Pending' : 'Lunas';
    const nextSheetStatus = serializePaymentStatusForSheet(
      nextStatus,
      targetOrder.paymentMethod
    );
    const token = getAccessToken();

    if (connectedSheet && token && targetOrder.sheetRowIndex) {
      const cellA1 = `${connectedSheet.statusColumnLetter}${targetOrder.sheetRowIndex}`;
      setPendingMutation({
        title: 'Perbarui Status di Google Sheets?',
        description:
          'Tindakan ini akan mengubah kolom Status Pembayaran pada spreadsheet Google Drive Anda secara langsung.',
        targetSheet: `${connectedSheet.spreadsheetTitle} (${connectedSheet.sheetTitle} · Sel ${cellA1})`,
        detailLine: `${targetOrder.customerName} (${targetOrder.id}): "${targetOrder.paymentStatus}" → "${nextSheetStatus}"`,
        confirmLabel: 'Konfirmasi & Update Sheets',
        onConfirm: async () => {
          await updateSheetCellValue(
            token,
            connectedSheet.spreadsheetId,
            connectedSheet.sheetTitle,
            cellA1,
            nextSheetStatus
          );
          applyLocalStatusToggle(orderId);
          setSyncBannerMsg(
            `Status ${targetOrder.customerName} (sel ${cellA1}) diperbarui menjadi "${nextSheetStatus}" di Google Sheets.`
          );
        },
      });
      return;
    }

    applyLocalStatusToggle(orderId);
  }

  async function handleConfirmPendingMutation() {
    if (!pendingMutation) return;
    setIsMutationSubmitting(true);
    setSyncBannerError('');
    try {
      await pendingMutation.onConfirm();
      setPendingMutation(null);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        clearAccessToken();
        setHasAccessToken(false);
      }
      setSyncBannerError(
        err instanceof Error
          ? err.message
          : 'Gagal menulis perubahan ke Google Sheets.'
      );
      setPendingMutation(null);
    } finally {
      setIsMutationSubmitting(false);
    }
  }

  function handleUpdateOrderFinancials(
    orderId: string,
    patch: { shippingFee: number; discount: number; invoiceNote: string }
  ) {
    let updatedOrder: SalesOrder | null = null;
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const { itemsSubtotal, totalAmount } = calculateOrderTotals(
          order.items,
          patch.shippingFee,
          patch.discount
        );
        updatedOrder = {
          ...order,
          shippingFee: patch.shippingFee,
          discount: patch.discount,
          invoiceNote: patch.invoiceNote,
          itemsSubtotal,
          totalAmount,
        };
        return updatedOrder;
      })
    );
    if (updatedOrder) {
      const synced = updatedOrder;
      setCashflowEntries((prev) => syncOrderToCashflow(synced, prev));
    }
  }

  function handleDeleteOrder(orderId: string) {
    setOrders((prev) => {
      const next = prev.filter((o) => o.id !== orderId);
      if (selectedInvoiceOrderId === orderId) {
        setSelectedInvoiceOrderId(next[0]?.id || '');
      }
      return next;
    });
    setCashflowEntries((prev) => prev.filter((e) => e.linkedOrderId !== orderId));
  }

  function handleAddCashflowEntry(entryInput: Omit<CashflowEntry, 'id'>) {
    const nextEntry: CashflowEntry = {
      ...entryInput,
      id: `CF-${Date.now().toString().slice(-5)}`,
    };
    setCashflowEntries((prev) => [...prev, nextEntry]);
  }

  function handleDeleteCashflowEntry(entryId: string) {
    setCashflowEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  function handleOpenInvoice(orderId: string) {
    setSelectedInvoiceOrderId(orderId);
    setActiveTab('invoice');
  }

  function handleResetDemoData() {
    setOrders(SEED_ORDERS);
    setCashflowEntries(SEED_CASHFLOW);
    setSelectedInvoiceOrderId(SEED_ORDERS[0].id);
    setConnectedSheet(null);
    setSyncBannerMsg('');
    setSyncBannerError('');
  }

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#1A1614]">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenNewOrder={() => setIsNewOrderOpen(true)}
      />

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Google Sheets Workspace Integration Strip */}
        <div className="bg-white border border-[#E8E2DA] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <FileSpreadsheet
              className={`w-4 h-4 mt-0.5 sm:mt-0 shrink-0 ${
                connectedSheet ? 'text-[#15803D]' : 'text-[#8C3B19]'
              }`}
              aria-hidden="true"
            />
            <div className="text-xs text-[#1A1614] min-w-0">
              {connectedSheet ? (
                <>
                  <span className="font-semibold">
                    Google Sheets: {connectedSheet.spreadsheetTitle}
                  </span>
                  <span className="text-[#6E635C] ml-1.5">
                    · Tab {connectedSheet.sheetTitle}
                    {connectedSheet.lastSyncedAt
                      ? ` · Terakhir sinkron ${formatWIB(connectedSheet.lastSyncedAt)}`
                      : ''}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold">Integrasi Spreadsheet Google Drive</span>
                  <span className="text-[#6E635C] ml-1.5">
                    · Hubungkan Database_Pesanan_Kopi_D_SHYT langsung dari Drive Anda
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {connectedSheet && (
              <button
                type="button"
                onClick={handleQuickResync}
                disabled={isQuickSyncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2D9CE] bg-[#FAF8F5] hover:bg-white text-xs font-semibold text-[#1A1614] cursor-pointer disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isQuickSyncing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{isQuickSyncing ? 'Menarik...' : 'Tarik Ulang'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSheetsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1A1614] hover:bg-[#332B27] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{connectedSheet ? 'Kelola Sheet' : 'Hubungkan Google Sheets'}</span>
            </button>
          </div>
        </div>

        {syncBannerError && (
          <div
            role="alert"
            className="text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-4 py-2.5 flex items-center justify-between gap-3"
          >
            <span>{syncBannerError}</span>
            <button
              type="button"
              onClick={() => setSyncBannerError('')}
              className="text-[#B91C1C] font-semibold cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {syncBannerMsg && (
          <div
            role="status"
            className="text-xs font-medium text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl px-4 py-2.5 flex items-center justify-between gap-3"
          >
            <span>{syncBannerMsg}</span>
            <button
              type="button"
              onClick={() => setSyncBannerMsg('')}
              className="text-[#15803D] font-semibold cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {activeTab === 'sales' && (
          <SalesLogView
            orders={orders}
            onToggleStatus={handleToggleStatus}
            onOpenInvoice={handleOpenInvoice}
            onDeleteOrder={handleDeleteOrder}
            onOpenNewOrder={() => setIsNewOrderOpen(true)}
            onExportCSV={(filtered) => exportSalesToCSV(filtered)}
            onExportXLSX={() =>
              exportWorkbookToXLSX(orders, breakdown, cashflowWithBalance)
            }
          />
        )}

        {activeTab === 'products' && <ProductBreakdownView orders={orders} />}

        {activeTab === 'cashflow' && (
          <CashflowView
            entries={cashflowEntries}
            onAddEntry={handleAddCashflowEntry}
            onDeleteEntry={handleDeleteCashflowEntry}
          />
        )}

        {activeTab === 'invoice' && (
          <InvoiceGeneratorView
            orders={orders}
            selectedOrderId={selectedInvoiceOrderId}
            onSelectOrderId={setSelectedInvoiceOrderId}
            onUpdateOrderFinancials={handleUpdateOrderFinancials}
            onToggleStatus={handleToggleStatus}
          />
        )}
      </main>

      <footer className="border-t border-[#E8E2DA] bg-white/60">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#6E635C]">
          <div>
            <span className="font-semibold text-[#1A1614]">{STORE_INFO.invoiceTitle}</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>{STORE_INFO.tagline}</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href={STORE_INFO.preOrderUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#1A1614] underline underline-offset-4"
            >
              Portal Pre-Order Pelanggan
            </a>
            <button
              type="button"
              onClick={handleResetDemoData}
              className="hover:text-[#C2410C] transition-colors cursor-pointer"
            >
              Reset Data Demo
            </button>
          </div>
        </div>
      </footer>

      <PreOrderModal
        isOpen={isNewOrderOpen}
        onClose={() => setIsNewOrderOpen(false)}
        onCreateOrder={handleCreateOrder}
      />

      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        user={googleUser}
        hasAccessToken={hasAccessToken}
        onAuthUpdated={(u, hasToken) => {
          setGoogleUser(u);
          setHasAccessToken(hasToken);
        }}
        connectedSheet={connectedSheet}
        onSyncFromGoogleSheet={handleSyncFromGoogleSheet}
        onLoadAttachedSnapshot={handleLoadAttachedSnapshot}
        onDisconnectSheet={() => {
          setConnectedSheet(null);
          setSyncBannerMsg('Koneksi spreadsheet diputuskan. Menggunakan penyimpanan lokal.');
        }}
      />

      <SheetConfirmModal
        mutation={pendingMutation}
        isSubmitting={isMutationSubmitting}
        onCancel={() => setPendingMutation(null)}
        onProceed={() => void handleConfirmPendingMutation()}
      />
    </div>
  );
}
