import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  LogOut,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  ConnectedSpreadsheet,
  DriveSpreadsheetFile,
  SheetTabInfo,
} from '../types/dshyt';
import {
  getAccessToken,
  googleSignIn,
  googleSignOut,
} from '../utils/googleAuth';
import {
  getSpreadsheetMetadata,
  listDriveSpreadsheets,
} from '../utils/googleSheetsApi';
import { extractSpreadsheetId } from '../utils/sheetsParser';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  hasAccessToken: boolean;
  onAuthUpdated: (user: User | null, hasToken: boolean) => void;
  connectedSheet: ConnectedSpreadsheet | null;
  onSyncFromGoogleSheet: (
    spreadsheetId: string,
    spreadsheetTitle: string,
    sheetTitle: string
  ) => Promise<void>;
  onLoadAttachedSnapshot: () => Promise<void>;
  onDisconnectSheet: () => void;
}

export function GoogleSheetsModal({
  isOpen,
  onClose,
  user,
  hasAccessToken,
  onAuthUpdated,
  connectedSheet,
  onSyncFromGoogleSheet,
  onLoadAttachedSnapshot,
  onDisconnectSheet,
}: GoogleSheetsModalProps) {
  const [driveFiles, setDriveFiles] = useState<DriveSpreadsheetFile[]>([]);
  const [driveSearch, setDriveSearch] = useState('');
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);

  const [manualUrlOrId, setManualUrlOrId] = useState(
    connectedSheet?.spreadsheetId || ''
  );
  const [selectedId, setSelectedId] = useState(
    connectedSheet?.spreadsheetId || ''
  );
  const [selectedTitle, setSelectedTitle] = useState(
    connectedSheet?.spreadsheetTitle || ''
  );
  const [tabs, setTabs] = useState<SheetTabInfo[]>([]);
  const [selectedTab, setSelectedTab] = useState(
    connectedSheet?.sheetTitle || ''
  );

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingTabs, setIsLoadingTabs] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setStatusMsg('');
    const token = getAccessToken();
    if (token) {
      void fetchDriveFiles(token, '');
    }
  }, [isOpen, hasAccessToken]);

  if (!isOpen) return null;

  async function fetchDriveFiles(token: string, query: string) {
    setIsLoadingDrive(true);
    setErrorMsg('');
    try {
      const files = await listDriveSpreadsheets(token, query);
      setDriveFiles(files);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal mengambil daftar spreadsheet dari Google Drive.';
      setErrorMsg(msg);
    } finally {
      setIsLoadingDrive(false);
    }
  }

  async function handleSignIn() {
    setIsLoggingIn(true);
    setErrorMsg('');
    try {
      const result = await googleSignIn();
      onAuthUpdated(result.user, true);
      await fetchDriveFiles(result.accessToken, driveSearch);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal masuk dengan akun Google. Silakan coba lagi.';
      setErrorMsg(msg);
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleSignOut() {
    await googleSignOut();
    onAuthUpdated(null, false);
    setDriveFiles([]);
    setTabs([]);
  }

  async function handleInspectSpreadsheet(id: string, fallbackName: string) {
    const token = getAccessToken();
    if (!token) {
      setErrorMsg('Sesi Google Anda berakhir. Silakan Sign in with Google kembali.');
      onAuthUpdated(user, false);
      return;
    }

    setIsLoadingTabs(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      const meta = await getSpreadsheetMetadata(token, id);
      setSelectedId(id);
      setSelectedTitle(meta.title || fallbackName);
      setTabs(meta.tabs);
      if (meta.tabs.length > 0) {
        const preferred =
          meta.tabs.find((t) =>
            /pesanan|order|database|sheet1/i.test(t.title)
          ) || meta.tabs[0];
        setSelectedTab(preferred.title);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Tidak dapat membaca metadata spreadsheet. Pastikan ID/URL valid dan Anda memiliki akses.';
      setErrorMsg(msg);
    } finally {
      setIsLoadingTabs(false);
    }
  }

  async function handleManualInspect() {
    const parsedId = extractSpreadsheetId(manualUrlOrId);
    if (!parsedId) {
      setErrorMsg(
        'Masukkan URL Google Sheets atau Spreadsheet ID yang valid (contoh: https://docs.google.com/spreadsheets/d/...).'
      );
      return;
    }
    await handleInspectSpreadsheet(parsedId, 'Spreadsheet Terpilih');
  }

  async function handleSyncNow() {
    if (!selectedId || !selectedTab) {
      setErrorMsg('Pilih spreadsheet dan tab sheet terlebih dahulu.');
      return;
    }
    setIsSyncing(true);
    setErrorMsg('');
    try {
      await onSyncFromGoogleSheet(selectedId, selectedTitle, selectedTab);
      setStatusMsg(
        `Berhasil menyinkronkan data dari "${selectedTitle}" (${selectedTab}).`
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Sinkronisasi spreadsheet gagal. Silakan coba lagi.';
      setErrorMsg(msg);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleLoadSnapshot() {
    setIsSyncing(true);
    setErrorMsg('');
    try {
      await onLoadAttachedSnapshot();
      setStatusMsg(
        'Berhasil memuat 36 pesanan dari Database_Pesanan_Kopi_D_SHYT.'
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal memuat data snapshot CSV.'
      );
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1A1614]/50 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheets-modal-title"
    >
      <div className="bg-[#FAF8F5] border border-[#E8E2DA] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-white border-b border-[#E8E2DA] flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-[#8C3B19] uppercase tracking-wider">
              Integrasi Google Drive &amp; Google Sheets
            </p>
            <h2
              id="sheets-modal-title"
              className="font-display text-xl font-bold text-[#1A1614]"
            >
              Sambungkan Spreadsheet Pesanan
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan Google Sheets"
            className="p-2 rounded-lg text-[#6E635C] hover:text-[#1A1614] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3.5 py-2.5"
            >
              {errorMsg}
            </div>
          )}

          {statusMsg && (
            <div
              role="status"
              className="flex items-center gap-2 text-xs font-medium text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg px-3.5 py-2.5"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Step 1: Google Sign-In */}
          <div className="bg-white border border-[#E8E2DA] rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#1A1614]">
                  1. Autentikasi Akun Google Drive
                </h3>
                <p className="text-xs text-[#6E635C] mt-0.5">
                  Masuk dengan Google untuk membaca daftar spreadsheet dan menyinkronkan status
                  pembayaran secara langsung.
                </p>
              </div>

              {hasAccessToken && user ? (
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-xs font-semibold text-[#1A1614]">
                      {user.displayName || user.email}
                    </div>
                    <div className="text-[11px] text-[#15803D]">Terhubung</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2D9CE] text-xs font-semibold text-[#6E635C] hover:text-[#B91C1C] cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Keluar</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={isLoggingIn}
                  className="inline-flex items-center gap-2.5 px-4 py-2 rounded-lg bg-white border border-[#DADCE0] hover:bg-[#F8FAFF] text-[#1F1F1F] text-xs font-semibold shadow-2xs transition-colors shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <svg
                    className="w-4 h-4 shrink-0"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>
                    {isLoggingIn ? 'Menghubungkan...' : 'Sign in with Google'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Step 2: Drive File Picker & Direct URL */}
          {hasAccessToken && (
            <div className="bg-white border border-[#E8E2DA] rounded-xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#1A1614]">
                  2. Pilih Spreadsheet dari Google Drive
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    const t = getAccessToken();
                    if (t) void fetchDriveFiles(t, driveSearch);
                  }}
                  disabled={isLoadingDrive}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C2410C] hover:text-[#A33609] cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isLoadingDrive ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Muat Ulang Drive</span>
                </button>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    className="w-3.5 h-3.5 text-[#8A7E75] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    aria-label="Cari nama spreadsheet di Google Drive"
                    placeholder="Cari nama file (misal: Database Pesanan Kopi D'SHYT)..."
                    value={driveSearch}
                    onChange={(e) => setDriveSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:bg-white focus:border-[#C2410C]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const t = getAccessToken();
                    if (t) void fetchDriveFiles(t, driveSearch);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-[#1A1614] text-white text-xs font-semibold cursor-pointer"
                >
                  Cari
                </button>
              </div>

              {driveFiles.length > 0 ? (
                <div className="max-h-44 overflow-y-auto divide-y divide-[#EFEAE2] border border-[#EFEAE2] rounded-lg">
                  {driveFiles.map((file) => {
                    const isPicked = selectedId === file.id;
                    return (
                      <div
                        key={file.id}
                        className={`px-3 py-2.5 flex items-center justify-between gap-3 ${
                          isPicked ? 'bg-[#FFF5EE]' : 'bg-white hover:bg-[#FAF8F5]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void handleInspectSpreadsheet(file.id, file.name)
                          }
                          className="flex-1 text-left flex items-center gap-2.5 min-w-0 cursor-pointer"
                        >
                          <FileSpreadsheet
                            className="w-4 h-4 text-[#15803D] shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#1A1614] truncate">
                              {file.name}
                            </div>
                            <div className="text-[11px] font-mono text-[#6E635C] truncate">
                              ID: {file.id}
                            </div>
                          </div>
                        </button>
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Buka ${file.name} di Google Sheets`}
                            className="p-1.5 text-[#6E635C] hover:text-[#1A1614] shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[#6E635C] bg-[#FAF8F5] border border-dashed border-[#D5CBC0] rounded-lg p-3">
                  {isLoadingDrive
                    ? 'Mengambil daftar spreadsheet dari Google Drive...'
                    : 'Belum ada daftar spreadsheet tampil. Cari nama file di atas atau tempel URL Google Sheets di bawah ini.'}
                </p>
              )}

              {/* Manual URL / ID input */}
              <div className="pt-2 border-t border-[#EFEAE2] space-y-2">
                <label
                  htmlFor="manual-sheet-url"
                  className="block text-xs font-semibold text-[#1A1614]"
                >
                  Atau Tempel URL / Spreadsheet ID
                </label>
                <div className="flex gap-2">
                  <input
                    id="manual-sheet-url"
                    type="text"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={manualUrlOrId}
                    onChange={(e) => setManualUrlOrId(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs font-mono bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:bg-white focus:border-[#C2410C]"
                  />
                  <button
                    type="button"
                    onClick={handleManualInspect}
                    disabled={isLoadingTabs}
                    className="px-3.5 py-2 rounded-lg border border-[#E2D9CE] bg-white hover:bg-[#FAF8F5] text-xs font-semibold text-[#1A1614] cursor-pointer"
                  >
                    {isLoadingTabs ? 'Memeriksa...' : 'Periksa Sheet'}
                  </button>
                </div>
              </div>

              {/* Tab Picker & Sync Button */}
              {selectedId && tabs.length > 0 && (
                <div className="pt-3 border-t border-[#EFEAE2] flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div className="flex-1">
                    <label
                      htmlFor="sheet-tab-select"
                      className="block text-xs font-semibold text-[#1A1614] mb-1"
                    >
                      Tab Worksheet pada "{selectedTitle}"
                    </label>
                    <select
                      id="sheet-tab-select"
                      value={selectedTab}
                      onChange={(e) => setSelectedTab(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:border-[#C2410C]"
                    >
                      {tabs.map((tab) => (
                        <option key={tab.sheetId} value={tab.title}>
                          {tab.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                    className="px-4 py-2 rounded-lg bg-[#C2410C] hover:bg-[#A33609] disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isSyncing ? 'Menyinkronkan...' : 'Tarik & Sinkronkan Data'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Option B: Load attached Database_Pesanan_Kopi_D_SHYT snapshot directly */}
          <div className="bg-white border border-[#E8E2DA] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#1A1614]">
                Snapshot File Terlampir (Database_Pesanan_Kopi_D_SHYT)
              </h3>
              <p className="text-xs text-[#6E635C] mt-0.5">
                Muat langsung 36 transaksi pesanan dari file ekspor spreadsheet yang Anda lampirkan
                (Maria Adella, Bu bella, Bu dina, Brigitta, dll.).
              </p>
            </div>
            <button
              type="button"
              onClick={handleLoadSnapshot}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1A1614] hover:bg-[#332B27] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Muat Snapshot CSV</span>
            </button>
          </div>

          {connectedSheet && (
            <div className="flex items-center justify-between text-xs text-[#6E635C] pt-1">
              <span>
                Spreadsheet aktif: <strong>{connectedSheet.spreadsheetTitle}</strong> (
                {connectedSheet.sheetTitle})
              </span>
              <button
                type="button"
                onClick={onDisconnectSheet}
                className="text-[#B91C1C] hover:underline cursor-pointer"
              >
                Putuskan Koneksi Sheet
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
