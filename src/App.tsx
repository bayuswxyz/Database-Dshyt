import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
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
  OrderStatus,
  SalesOrder,
} from './types/dshyt';
import { exportSalesToCSV, exportWorkbookToXLSX } from './utils/exportUtils';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initGoogleAuth,
} from './utils/googleAuth';
import {
  appendSheetRow,
  batchUpdateSheetValues,
  deleteSheetRow,
  getSpreadsheetMetadata,
  listDriveSpreadsheets,
  readSheetValues,
  updateSheetCellValue,
} from './utils/googleSheetsApi';
import {
  calculateOrderTotals,
  computeCashflowWithBalance,
  computeProductBreakdown,
  formatIDR,
  formatWIB,
  generateNextOrderId,
  syncOrderToCashflow,
} from './utils/ledger';
import {
  buildSheetRowUpdatePayload,
  DEFAULT_SHEET_COLUMNS,
  findBestMatchingSpreadsheet,
  parseCSVText,
  parseSheetValuesToOrders,
  serializeOrderToSheetRow,
  serializePaymentStatusForSheet,
} from './utils/sheetsParser';

const STORAGE_ORDERS_KEY = 'dshyt_sales_orders_v1';
const STORAGE_CASHFLOW_KEY = 'dshyt_cashflow_v1';
const STORAGE_SHEET_META_KEY = 'dshyt_connected_sheet_v1';
const STORAGE_AUTOSYNC_KEY = 'dshyt_autosync_enabled_v1';
const ATTACHED_CSV_PATH =
  '/assets/aistudio/Database_Pesanan_Kopi_D_SHYT_d1296e85';
const AUTO_SYNC_INTERVAL_MS = 30_000;

function hasSavedOrdersInStorage(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_ORDERS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function loadInitialOrders(): SalesOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_ORDERS_KEY);
    if (!raw) return SEED_ORDERS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return SEED_ORDERS;
    return parsed.map((order: SalesOrder) => ({
      ...order,
      orderStatus: order.orderStatus || 'Diterima',
    }));
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

function loadInitialAutoSync(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_AUTOSYNC_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
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
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);

  // Google Workspace Auth & Sheets connection state (access token is strictly in-memory)
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [connectedSheet, setConnectedSheet] =
    useState<ConnectedSpreadsheet | null>(loadInitialSheetMeta);
  const [autoSyncEnabled, setAutoSyncEnabled] =
    useState<boolean>(loadInitialAutoSync);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isQuickSyncing, setIsQuickSyncing] = useState(false);
  const [syncBannerMsg, setSyncBannerMsg] = useState<string>('');
  const [syncBannerError, setSyncBannerError] = useState<string>('');

  const [pendingMutation, setPendingMutation] =
    useState<PendingSheetMutation | null>(null);
  const [isMutationSubmitting, setIsMutationSubmitting] = useState(false);

  const lastAutoSyncAtRef = useRef<number>(0);

  const applyImportedOrders = useCallback(
    (importedOrders: SalesOrder[], preserveLocalOrderStatus: boolean = false) => {
      setOrders((prev) => {
        if (!preserveLocalOrderStatus) return importedOrders;
        const localStatusByRow = new Map<number, OrderStatus>();
        for (const existing of prev) {
          if (existing.sheetRowIndex && existing.orderStatus) {
            localStatusByRow.set(existing.sheetRowIndex, existing.orderStatus);
          }
        }
        return importedOrders.map((order) => {
          const preserved =
            order.sheetRowIndex !== undefined
              ? localStatusByRow.get(order.sheetRowIndex)
              : undefined;
          return preserved ? { ...order, orderStatus: preserved } : order;
        });
      });
      setSelectedInvoiceOrderId((prev) =>
        importedOrders.some((o) => o.id === prev) ? prev : importedOrders[0]?.id || ''
      );

      setCashflowEntries((prev) => {
        let next = prev.filter((entry) => !entry.linkedOrderId);
        for (const order of importedOrders) {
          next = syncOrderToCashflow(order, next);
        }
        return next;
      });
    },
    []
  );

  // Load real attached spreadsheet snapshot on very first launch when localStorage is empty
  useEffect(() => {
    if (hasSavedOrdersInStorage()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(ATTACHED_CSV_PATH);
        if (!res.ok || cancelled) return;
        const csvText = await res.text();
        if (cancelled) return;
        const { orders: parsedOrders } = parseSheetValuesToOrders(
          parseCSVText(csvText),
          MENU_CATALOG
        );
        if (parsedOrders.length > 0 && !cancelled) {
          applyImportedOrders(parsedOrders);
        }
      } catch {
        // fallback cleanly to SEED_ORDERS
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyImportedOrders]);

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_AUTOSYNC_KEY, String(autoSyncEnabled));
    } catch {
      // ignore
    }
  }, [autoSyncEnabled]);

  const breakdown = useMemo(
    () => computeProductBreakdown(orders, MENU_CATALOG, false),
    [orders]
  );

  const cashflowWithBalance = useMemo(
    () => computeCashflowWithBalance(cashflowEntries).rows,
    [cashflowEntries]
  );

  const handleSyncFromGoogleSheet = useCallback(
    async (
      spreadsheetId: string,
      spreadsheetTitle: string,
      sheetTitle: string,
      silent: boolean = false
    ) => {
      const token = getAccessToken();
      if (!token) {
        setHasAccessToken(false);
        if (!silent) {
          setIsSheetsModalOpen(true);
        }
        throw new Error('Silakan Sign in with Google terlebih dahulu.');
      }

      if (!silent) setSyncBannerError('');
      try {
        const values = await readSheetValues(token, spreadsheetId, sheetTitle);
        const {
          orders: parsedOrders,
          statusColumnLetter,
          orderStatusColumnLetter,
          hasOrderStatusHeader,
          columnIndices,
        } = parseSheetValuesToOrders(values, MENU_CATALOG);

        if (parsedOrders.length === 0) {
          throw new Error(
            `Tab "${sheetTitle}" tidak memiliki baris pesanan yang dapat dibaca.`
          );
        }

        applyImportedOrders(parsedOrders, !hasOrderStatusHeader);
        const nowIso = new Date().toISOString();
        lastAutoSyncAtRef.current = Date.now();
        setConnectedSheet((prev) => ({
          spreadsheetId,
          spreadsheetTitle,
          sheetId:
            prev?.spreadsheetId === spreadsheetId && prev?.sheetTitle === sheetTitle
              ? prev.sheetId
              : undefined,
          sheetTitle,
          statusColumnLetter,
          orderStatusColumnLetter,
          hasOrderStatusHeader,
          columnIndices,
          lastSyncedAt: nowIso,
        }));
        if (!silent) {
          setSyncBannerMsg(
            `${parsedOrders.length} pesanan berhasil disinkronkan dari "${spreadsheetTitle}" (${sheetTitle}).`
          );
        }
      } catch (err) {
        const status = (err as { status?: number })?.status;
        if (status === 401) {
          clearAccessToken();
          setHasAccessToken(false);
          setSyncBannerError(
            'Sesi Google berakhir. Klik "Sambungkan Kembali" untuk melanjutkan sinkronisasi otomatis.'
          );
        }
        throw err;
      }
    },
    [applyImportedOrders]
  );

  // Continuous live auto-sync loop (30s interval + window focus) while connected & active
  useEffect(() => {
    if (!connectedSheet || !hasAccessToken || !autoSyncEnabled) return;

    const runSilentSync = async () => {
      const now = Date.now();
      if (now - lastAutoSyncAtRef.current < 10_000) return;
      if (!getAccessToken()) return;
      try {
        await handleSyncFromGoogleSheet(
          connectedSheet.spreadsheetId,
          connectedSheet.spreadsheetTitle,
          connectedSheet.sheetTitle,
          true
        );
      } catch {
        // 401 handled inside handleSyncFromGoogleSheet
      }
    };

    const intervalId = window.setInterval(() => {
      void runSilentSync();
    }, AUTO_SYNC_INTERVAL_MS);

    const handleFocus = () => {
      void runSilentSync();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [connectedSheet, hasAccessToken, autoSyncEnabled, handleSyncFromGoogleSheet]);

  async function handleOneClickReconnectOrConnect() {
    setIsQuickSyncing(true);
    setSyncBannerError('');
    try {
      const result = await googleSignIn(googleUser?.email || undefined);
      setGoogleUser(result.user);
      setHasAccessToken(true);

      if (connectedSheet) {
        await handleSyncFromGoogleSheet(
          connectedSheet.spreadsheetId,
          connectedSheet.spreadsheetTitle,
          connectedSheet.sheetTitle
        );
        return;
      }

      const files = await listDriveSpreadsheets(result.accessToken);
      const bestMatch = findBestMatchingSpreadsheet(files);
      if (bestMatch) {
        const meta = await getSpreadsheetMetadata(result.accessToken, bestMatch.id);
        const preferredTab =
          meta.tabs.find((t) =>
            /pesanan|order|database|sheet1/i.test(t.title)
          ) || meta.tabs[0];
        if (preferredTab) {
          await handleSyncFromGoogleSheet(
            bestMatch.id,
            meta.title || bestMatch.name,
            preferredTab.title
          );
          return;
        }
      }

      setIsSheetsModalOpen(true);
    } catch (err) {
      setSyncBannerError(
        err instanceof Error
          ? err.message
          : 'Gagal menyambungkan Google Sheets. Silakan coba lagi.'
      );
    } finally {
      setIsQuickSyncing(false);
    }
  }

  async function handleQuickResync() {
    if (!connectedSheet) {
      await handleOneClickReconnectOrConnect();
      return;
    }
    const token = getAccessToken();
    if (!token) {
      await handleOneClickReconnectOrConnect();
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
      const colMap = connectedSheet.columnIndices || DEFAULT_SHEET_COLUMNS;
      const orderStatusCol = connectedSheet.orderStatusColumnLetter || 'M';
      setPendingMutation({
        title: 'Tambahkan Pesanan ke Google Sheets?',
        description:
          'Spreadsheet Google Anda sedang terhubung. Konfirmasikan apakah pesanan baru ini ingin langsung ditambahkan sebagai baris baru ke Google Sheets.',
        targetSheet: `${connectedSheet.spreadsheetTitle} (${connectedSheet.sheetTitle})`,
        detailLine: `${previewOrder.customerName} — ${previewOrder.items.length} item (${previewOrder.orderStatus} · ${previewOrder.paymentStatus})`,
        confirmLabel: 'Konfirmasi & Tambah ke Sheets',
        onConfirm: async () => {
          if (!connectedSheet.hasOrderStatusHeader) {
            await updateSheetCellValue(
              token,
              connectedSheet.spreadsheetId,
              connectedSheet.sheetTitle,
              `${orderStatusCol}1`,
              'Status Pemesanan'
            );
          }
          const rowValues = serializeOrderToSheetRow(previewOrder, colMap);
          await appendSheetRow(
            token,
            connectedSheet.spreadsheetId,
            connectedSheet.sheetTitle,
            rowValues
          );
          await handleSyncFromGoogleSheet(
            connectedSheet.spreadsheetId,
            connectedSheet.spreadsheetTitle,
            connectedSheet.sheetTitle,
            true
          );
          setIsNewOrderOpen(false);
          if (openInvoiceAfter) {
            setActiveTab('invoice');
          }
          setSyncBannerMsg(
            `Pesanan baru untuk ${previewOrder.customerName} berhasil ditambahkan & disinkronkan dengan Google Sheets.`
          );
        },
      });
      return;
    }

    applyLocalOrderCreation(orderInput, openInvoiceAfter);
    if (connectedSheet && !token) {
      setSyncBannerError(
        'Pesanan disimpan lokal karena sesi Google belum aktif. Klik "Sambungkan Kembali" untuk menghubungkan ulang ke Google Sheets.'
      );
    }
  }

  function applyLocalOrderUpdate(updatedOrder: SalesOrder, openInvoiceAfter: boolean) {
    setOrders((prev) =>
      prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
    );
    setCashflowEntries((prev) => syncOrderToCashflow(updatedOrder, prev));
    setEditingOrder(null);
    setIsNewOrderOpen(false);
    setSelectedInvoiceOrderId(updatedOrder.id);
    if (openInvoiceAfter) {
      setActiveTab('invoice');
    }
  }

  function handleUpdateOrder(
    orderId: string,
    orderInput: Omit<SalesOrder, 'id' | 'createdAt'>,
    openInvoiceAfter: boolean
  ) {
    const existing = orders.find((o) => o.id === orderId);
    if (!existing) return;

    const updatedOrder: SalesOrder = {
      ...existing,
      ...orderInput,
      id: existing.id,
      createdAt: existing.createdAt,
      sheetRowIndex: existing.sheetRowIndex,
      source: existing.source,
      sheetRawStatus: serializePaymentStatusForSheet(
        orderInput.paymentStatus,
        orderInput.paymentMethod
      ),
      sheetRawOrderStatus: orderInput.orderStatus,
    };

    const token = getAccessToken();
    if (connectedSheet && token && existing.sheetRowIndex) {
      const colMap = connectedSheet.columnIndices || DEFAULT_SHEET_COLUMNS;
      const updates = buildSheetRowUpdatePayload(
        updatedOrder,
        existing.sheetRowIndex,
        colMap
      );
      setPendingMutation({
        title: `Perbarui Baris #${existing.sheetRowIndex} di Google Sheets?`,
        description:
          'Seluruh perubahan data pemesan, item menu, total harga, status pembayaran, dan status pemesanan akan ditulis langsung ke baris spreadsheet Anda.',
        targetSheet: `${connectedSheet.spreadsheetTitle} (${connectedSheet.sheetTitle} · Baris #${existing.sheetRowIndex})`,
        detailLine: `${updatedOrder.customerName} (${updatedOrder.id}) — ${formatIDR(
          updatedOrder.totalAmount
        )} · ${updatedOrder.orderStatus} · ${updatedOrder.paymentStatus}`,
        confirmLabel: 'Konfirmasi & Edit Sheets',
        onConfirm: async () => {
          await batchUpdateSheetValues(
            token,
            connectedSheet.spreadsheetId,
            connectedSheet.sheetTitle,
            updates
          );
          if (!connectedSheet.hasOrderStatusHeader) {
            setConnectedSheet((prev) =>
              prev
                ? {
                    ...prev,
                    hasOrderStatusHeader: true,
                    columnIndices: prev.columnIndices
                      ? { ...prev.columnIndices, hasOrderStatusHeader: true }
                      : undefined,
                  }
                : prev
            );
          }
          applyLocalOrderUpdate(updatedOrder, openInvoiceAfter);
          setSyncBannerMsg(
            `Baris #${existing.sheetRowIndex} (${updatedOrder.customerName}) berhasil diperbarui langsung di Google Sheets.`
          );
        },
      });
      return;
    }

    applyLocalOrderUpdate(updatedOrder, openInvoiceAfter);
    if (connectedSheet && !token && existing.sheetRowIndex) {
      setSyncBannerError(
        'Perubahan disimpan secara lokal karena sesi Google belum aktif. Klik "Sambungkan Kembali" untuk menyinkronkan ke Google Sheets.'
      );
    }
  }

  function handlePushOrderToSheet(order: SalesOrder) {
    const token = getAccessToken();
    if (!connectedSheet || !order.sheetRowIndex) return;
    if (!token) {
      setSyncBannerError(
        'Sesi Google belum aktif. Klik "Sambungkan Kembali" untuk menyimpan perubahan ke Google Sheets.'
      );
      return;
    }
    const colMap = connectedSheet.columnIndices || DEFAULT_SHEET_COLUMNS;
    const updates = buildSheetRowUpdatePayload(order, order.sheetRowIndex, colMap);
    setPendingMutation({
      title: `Simpan Perubahan Baris #${order.sheetRowIndex} ke Google Sheets?`,
      description:
        'Perubahan rincian biaya, catatan nota, dan status pada transaksi ini akan langsung ditulis ke spreadsheet Google Drive Anda.',
      targetSheet: `${connectedSheet.spreadsheetTitle} (${connectedSheet.sheetTitle} · Baris #${order.sheetRowIndex})`,
      detailLine: `${order.customerName} (${order.id}) — ${formatIDR(order.totalAmount)} · ${order.orderStatus} · ${order.paymentStatus}`,
      confirmLabel: 'Konfirmasi & Simpan ke Sheets',
      onConfirm: async () => {
        await batchUpdateSheetValues(
          token,
          connectedSheet.spreadsheetId,
          connectedSheet.sheetTitle,
          updates
        );
        if (!connectedSheet.hasOrderStatusHeader) {
          setConnectedSheet((prev) =>
            prev
              ? {
                  ...prev,
                  hasOrderStatusHeader: true,
                  columnIndices: prev.columnIndices
                    ? { ...prev.columnIndices, hasOrderStatusHeader: true }
                    : undefined,
                }
              : prev
          );
        }
        setSyncBannerMsg(
          `Perubahan ${order.customerName} (baris #${order.sheetRowIndex}) berhasil disimpan ke Google Sheets.`
        );
      },
    });
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
        title: 'Perbarui Status Pembayaran di Google Sheets?',
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
    if (connectedSheet && !token && targetOrder.sheetRowIndex) {
      setSyncBannerError(
        'Status diubah secara lokal karena sesi Google belum aktif. Klik "Sambungkan Kembali" untuk menyinkronkan ke Google Sheets.'
      );
    }
  }

  function applyLocalOrderStatusChange(orderId: string, nextOrderStatus: OrderStatus) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? {
              ...order,
              orderStatus: nextOrderStatus,
              sheetRawOrderStatus: nextOrderStatus,
            }
          : order
      )
    );
  }

  function handleUpdateOrderStatus(orderId: string, nextOrderStatus: OrderStatus) {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder || targetOrder.orderStatus === nextOrderStatus) return;

    const token = getAccessToken();
    if (connectedSheet && token && targetOrder.sheetRowIndex) {
      const orderStatusCol = connectedSheet.orderStatusColumnLetter || 'M';
      const cellA1 = `${orderStatusCol}${targetOrder.sheetRowIndex}`;
      const updates: Array<{ rangeA1: string; values: string[][] }> = [];
      if (!connectedSheet.hasOrderStatusHeader) {
        updates.push({
          rangeA1: `${orderStatusCol}1`,
          values: [['Status Pemesanan']],
        });
      }
      updates.push({
        rangeA1: cellA1,
        values: [[nextOrderStatus]],
      });

      setPendingMutation({
        title: 'Perbarui Status Pemesanan di Google Sheets?',
        description: !connectedSheet.hasOrderStatusHeader
          ? `Kolom "Status Pemesanan" akan ditambahkan di sel ${orderStatusCol}1, lalu status pesanan diperbarui ke sel ${cellA1}.`
          : 'Tindakan ini akan memperbarui kolom Status Pemesanan (Diterima / Proses / Selesai) langsung di Google Sheets.',
        targetSheet: `${connectedSheet.spreadsheetTitle} (${connectedSheet.sheetTitle} · Sel ${cellA1})`,
        detailLine: `${targetOrder.customerName} (${targetOrder.id}): "${targetOrder.orderStatus || 'Diterima'}" → "${nextOrderStatus}"`,
        confirmLabel: 'Konfirmasi & Update Sheets',
        onConfirm: async () => {
          await batchUpdateSheetValues(
            token,
            connectedSheet.spreadsheetId,
            connectedSheet.sheetTitle,
            updates
          );
          if (!connectedSheet.hasOrderStatusHeader) {
            setConnectedSheet((prev) =>
              prev
                ? {
                    ...prev,
                    hasOrderStatusHeader: true,
                    columnIndices: prev.columnIndices
                      ? { ...prev.columnIndices, hasOrderStatusHeader: true }
                      : undefined,
                  }
                : prev
            );
          }
          applyLocalOrderStatusChange(orderId, nextOrderStatus);
          setSyncBannerMsg(
            `Status pemesanan ${targetOrder.customerName} (sel ${cellA1}) diperbarui menjadi "${nextOrderStatus}" di Google Sheets.`
          );
        },
      });
      return;
    }

    applyLocalOrderStatusChange(orderId, nextOrderStatus);
    if (connectedSheet && !token && targetOrder.sheetRowIndex) {
      setSyncBannerError(
        'Status pemesanan diubah secara lokal karena sesi Google belum aktif. Klik "Sambungkan Kembali" untuk menyinkronkan ke Google Sheets.'
      );
    }
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

  function applyLocalDeleteOrder(orderId: string) {
    setOrders((prev) => {
      const next = prev.filter((o) => o.id !== orderId);
      if (selectedInvoiceOrderId === orderId) {
        setSelectedInvoiceOrderId(next[0]?.id || '');
      }
      return next;
    });
    setCashflowEntries((prev) => prev.filter((e) => e.linkedOrderId !== orderId));
  }

  function handleDeleteOrder(orderId: string) {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    const token = getAccessToken();
    if (connectedSheet && token && targetOrder.sheetRowIndex) {
      const rowToDelete = targetOrder.sheetRowIndex;
      setPendingMutation({
        title: `Hapus Baris #${rowToDelete} dari Google Sheets?`,
        description:
          'Tindakan ini akan menghapus baris pesanan secara permanen dari spreadsheet Google Drive Anda dan menarik ulang indeks baris terbaru.',
        targetSheet: `${connectedSheet.spreadsheetTitle} (${connectedSheet.sheetTitle} · Baris #${rowToDelete})`,
        detailLine: `Hapus pesanan ${targetOrder.customerName} (${targetOrder.id}) — ${formatIDR(targetOrder.totalAmount)}`,
        confirmLabel: 'Konfirmasi & Hapus dari Sheets',
        onConfirm: async () => {
          let sheetId = connectedSheet.sheetId;
          if (sheetId === undefined) {
            const meta = await getSpreadsheetMetadata(
              token,
              connectedSheet.spreadsheetId
            );
            const matchedTab = meta.tabs.find(
              (t) => t.title === connectedSheet.sheetTitle
            );
            sheetId = matchedTab?.sheetId ?? meta.tabs[0]?.sheetId ?? 0;
          }
          await deleteSheetRow(
            token,
            connectedSheet.spreadsheetId,
            sheetId,
            rowToDelete
          );
          await handleSyncFromGoogleSheet(
            connectedSheet.spreadsheetId,
            connectedSheet.spreadsheetTitle,
            connectedSheet.sheetTitle,
            true
          );
          setSyncBannerMsg(
            `Baris #${rowToDelete} (${targetOrder.customerName}) berhasil dihapus dari Google Sheets.`
          );
        },
      });
      return;
    }

    applyLocalDeleteOrder(orderId);
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

  const isLiveConnected = Boolean(connectedSheet && hasAccessToken);
  const needsSessionResume = Boolean(connectedSheet && !hasAccessToken);

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#1A1614]">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenNewOrder={() => {
          setEditingOrder(null);
          setIsNewOrderOpen(true);
        }}
      />

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Always-Visible Google Sheets Connection & Auto-Sync Strip */}
        <div className="bg-white border border-[#E8E2DA] rounded-xl px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            {isLiveConnected ? (
              <CheckCircle2
                className="w-4 h-4 mt-0.5 sm:mt-0 shrink-0 text-[#15803D]"
                aria-hidden="true"
              />
            ) : needsSessionResume ? (
              <AlertCircle
                className="w-4 h-4 mt-0.5 sm:mt-0 shrink-0 text-[#B45309]"
                aria-hidden="true"
              />
            ) : (
              <FileSpreadsheet
                className="w-4 h-4 mt-0.5 sm:mt-0 shrink-0 text-[#8C3B19]"
                aria-hidden="true"
              />
            )}

            <div className="text-xs text-[#1A1614] min-w-0">
              {isLiveConnected && connectedSheet ? (
                <>
                  <span className="font-semibold text-[#15803D]">
                    Terhubung Live: {connectedSheet.spreadsheetTitle}
                  </span>
                  <span className="text-[#6E635C] ml-1.5">
                    · Tab {connectedSheet.sheetTitle}
                    {connectedSheet.lastSyncedAt
                      ? ` · Sinkron ${formatWIB(connectedSheet.lastSyncedAt)}`
                      : ''}
                  </span>
                </>
              ) : needsSessionResume && connectedSheet ? (
                <>
                  <span className="font-semibold text-[#B45309]">
                    Sheet Tersimpan: {connectedSheet.spreadsheetTitle} (Sesi Google perlu aktivasi)
                  </span>
                  <span className="text-[#6E635C] ml-1.5">
                    · Klik Sambungkan Kembali untuk sinkronisasi otomatis setiap 30 detik
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold">
                    Database_Pesanan_Kopi_D_SHYT (Google Sheets)
                  </span>
                  <span className="text-[#6E635C] ml-1.5">
                    · Sambungkan dengan akun Google Drive untuk sinkronisasi &amp; edit live otomatis
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {connectedSheet && (
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2D9CE] bg-[#FAF8F5] text-xs font-medium text-[#1A1614] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSyncEnabled}
                  onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                  className="accent-[#C2410C]"
                />
                <span>Auto-Sync 30d</span>
              </label>
            )}

            {isLiveConnected && (
              <button
                type="button"
                onClick={() => void handleQuickResync()}
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

            {needsSessionResume && (
              <button
                type="button"
                onClick={() => void handleOneClickReconnectOrConnect()}
                disabled={isQuickSyncing}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#C2410C] hover:bg-[#A33609] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isQuickSyncing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>
                  {isQuickSyncing ? 'Menyambungkan...' : 'Sambungkan Kembali'}
                </span>
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
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onEditOrder={(order) => {
              setEditingOrder(order);
              setIsNewOrderOpen(true);
            }}
            onOpenInvoice={handleOpenInvoice}
            onDeleteOrder={handleDeleteOrder}
            onOpenNewOrder={() => {
              setEditingOrder(null);
              setIsNewOrderOpen(true);
            }}
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
            onUpdateOrderStatus={handleUpdateOrderStatus}
            canSyncRowToSheet={isLiveConnected}
            onPushOrderToSheet={handlePushOrderToSheet}
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
        editingOrder={editingOrder}
        onClose={() => {
          setIsNewOrderOpen(false);
          setEditingOrder(null);
        }}
        onCreateOrder={handleCreateOrder}
        onUpdateOrder={handleUpdateOrder}
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
