import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import type {
  CashflowCategory,
  CashflowDirection,
  CashflowEntry,
} from '../types/dshyt';
import {
  computeCashflowWithBalance,
  formatIDR,
  formatWIB,
} from '../utils/ledger';

interface CashflowViewProps {
  entries: CashflowEntry[];
  onAddEntry: (entry: Omit<CashflowEntry, 'id'>) => void;
  onDeleteEntry: (entryId: string) => void;
}

const INFLOW_CATEGORIES: CashflowCategory[] = ['Penjualan Pre-Order', 'Operasional'];
const OUTFLOW_CATEGORIES: CashflowCategory[] = ['Bahan Baku', 'Kemasan', 'Operasional'];

export function CashflowView({
  entries,
  onAddEntry,
  onDeleteEntry,
}: CashflowViewProps) {
  const [directionFilter, setDirectionFilter] = useState<'Semua' | CashflowDirection>('Semua');
  const [categoryFilter, setCategoryFilter] = useState<'Semua' | CashflowCategory>('Semua');
  const [showForm, setShowForm] = useState(false);

  const [direction, setDirection] = useState<CashflowDirection>('Keluar');
  const [category, setCategory] = useState<CashflowCategory>('Bahan Baku');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState('');

  const { rows: chronologicalRows, summary } = useMemo(
    () => computeCashflowWithBalance(entries),
    [entries]
  );

  // Display newest first in table while preserving accurate chronological running balance
  const visibleRows = useMemo(() => {
    return [...chronologicalRows]
      .reverse()
      .filter((row) => {
        if (directionFilter !== 'Semua' && row.direction !== directionFilter) return false;
        if (categoryFilter !== 'Semua' && row.category !== categoryFilter) return false;
        return true;
      });
  }, [chronologicalRows, directionFilter, categoryFilter]);

  function handleDirectionChange(nextDir: CashflowDirection) {
    setDirection(nextDir);
    const allowed = nextDir === 'Masuk' ? INFLOW_CATEGORIES : OUTFLOW_CATEGORIES;
    if (!allowed.includes(category)) {
      setCategory(allowed[0]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!description.trim()) {
      setFormError('Deskripsi transaksi wajib diisi.');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError('Nominal harus lebih besar dari Rp 0.');
      return;
    }

    onAddEntry({
      date: new Date().toISOString(),
      direction,
      category,
      description: description.trim(),
      amount: Math.round(numericAmount),
    });

    setDescription('');
    setAmount('');
    setFormError('');
    setShowForm(false);
  }

  return (
    <section aria-labelledby="cashflow-heading" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#8C3B19] tracking-wide">
            Likuiditas &amp; Operasional · Saldo Berjalan Otomatis
          </p>
          <h1
            id="cashflow-heading"
            className="font-display text-2xl sm:text-3xl font-bold text-[#1A1614] tracking-tight mt-1"
          >
            Manajemen Arus Kas
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A1614] hover:bg-[#332B27] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{showForm ? 'Tutup Form' : 'Catat Arus Kas'}</span>
        </button>
      </div>

      {/* Cashflow Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E8E2DA] rounded-xl p-4">
          <p className="text-xs font-medium text-[#6E635C]">Total Kas Masuk (Inflow)</p>
          <p
            data-testid="cf-total-inflow"
            className="font-mono tabular-nums text-2xl font-semibold text-[#15803D] mt-1.5"
          >
            {formatIDR(summary.totalInflow)}
          </p>
          <p className="text-xs text-[#6E635C] mt-1">
            Penjualan Pre-Order: {formatIDR(summary.byCategory['Penjualan Pre-Order'].inflow)}
          </p>
        </div>

        <div className="bg-white border border-[#E8E2DA] rounded-xl p-4">
          <p className="text-xs font-medium text-[#6E635C]">Total Kas Keluar (Outflow)</p>
          <p
            data-testid="cf-total-outflow"
            className="font-mono tabular-nums text-2xl font-semibold text-[#B91C1C] mt-1.5"
          >
            {formatIDR(summary.totalOutflow)}
          </p>
          <p className="text-xs text-[#6E635C] mt-1 font-mono tabular-nums">
            Bahan: {formatIDR(summary.byCategory['Bahan Baku'].outflow)} · Kemasan:{' '}
            {formatIDR(summary.byCategory.Kemasan.outflow)}
          </p>
        </div>

        <div className="bg-white border border-[#E8E2DA] rounded-xl p-4">
          <p className="text-xs font-medium text-[#6E635C]">Saldo Kas Berjalan</p>
          <p
            data-testid="cf-net-balance"
            className={`font-mono tabular-nums text-2xl font-semibold mt-1.5 ${
              summary.netBalance >= 0 ? 'text-[#1A1614]' : 'text-[#B91C1C]'
            }`}
          >
            {formatIDR(summary.netBalance)}
          </p>
          <p className="text-xs text-[#6E635C] mt-1 font-mono tabular-nums">
            Operasional keluar: {formatIDR(summary.byCategory.Operasional.outflow)}
          </p>
        </div>
      </div>

      {/* Collapsible Cashflow Entry Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-[#E8E2DA] rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-[#1A1614]">
              Catat Transaksi Arus Kas Baru
            </h2>
            <span className="text-xs text-[#6E635C]">Otomatis memperbarui saldo berjalan</span>
          </div>

          {formError && (
            <div
              role="alert"
              className="text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2"
            >
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1A1614] mb-1.5">
                Jenis Arus Kas
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F3EFE9] rounded-lg">
                {(['Keluar', 'Masuk'] as CashflowDirection[]).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => handleDirectionChange(dir)}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      direction === dir
                        ? 'bg-white text-[#1A1614] shadow-xs'
                        : 'text-[#6E635C] hover:text-[#1A1614]'
                    }`}
                  >
                    Kas {dir}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="cf-category"
                className="block text-xs font-semibold text-[#1A1614] mb-1.5"
              >
                Kategori
              </label>
              <select
                id="cf-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as CashflowCategory)}
                className="w-full px-3 py-2 text-xs bg-white border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:border-[#C2410C]"
              >
                {(direction === 'Masuk' ? INFLOW_CATEGORIES : OUTFLOW_CATEGORIES).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="cf-amount"
                className="block text-xs font-semibold text-[#1A1614] mb-1.5"
              >
                Nominal (IDR)
              </label>
              <input
                id="cf-amount"
                type="number"
                min={100}
                step={500}
                placeholder="Contoh: 185000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:border-[#C2410C]"
              />
            </div>

            <div>
              <label
                htmlFor="cf-desc"
                className="block text-xs font-semibold text-[#1A1614] mb-1.5"
              >
                Deskripsi Operasional
              </label>
              <input
                id="cf-desc"
                type="text"
                placeholder="Contoh: Beli Biji Kopi & Gula Aren"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:border-[#C2410C]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormError('');
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-[#E2D9CE] text-[#6E635C] hover:text-[#1A1614] cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#C2410C] hover:bg-[#A33609] text-white cursor-pointer"
            >
              Simpan Arus Kas
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-1 p-1 bg-[#EFEAE2] rounded-lg"
            role="group"
            aria-label="Filter arah arus kas"
          >
            {(['Semua', 'Masuk', 'Keluar'] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => setDirectionFilter(dir)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  directionFilter === dir
                    ? 'bg-white text-[#1A1614] shadow-xs'
                    : 'text-[#6E635C] hover:text-[#1A1614]'
                }`}
              >
                {dir === 'Semua' ? 'Semua Transaksi' : `Kas ${dir}`}
              </button>
            ))}
          </div>

          <label htmlFor="cf-filter-category" className="sr-only">
            Filter kategori arus kas
          </label>
          <select
            id="cf-filter-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'Semua' | CashflowCategory)}
            className="px-3 py-2 text-xs font-medium bg-white border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:border-[#C2410C]"
          >
            <option value="Semua">Semua Kategori</option>
            <option value="Penjualan Pre-Order">Penjualan Pre-Order</option>
            <option value="Bahan Baku">Bahan Baku</option>
            <option value="Kemasan">Kemasan</option>
            <option value="Operasional">Operasional</option>
          </select>
        </div>

        <p className="text-xs text-[#6E635C] font-mono tabular-nums">
          {visibleRows.length} entri mutasi kas
        </p>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-[#E8E2DA] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E8E2DA] bg-[#FAF8F5] text-[11px] font-semibold text-[#6E635C] uppercase tracking-wider">
                <th className="py-3 px-4">Tanggal (WIB)</th>
                <th className="py-3 px-4">Jenis &amp; Kategori</th>
                <th className="py-3 px-4">Deskripsi Operasional</th>
                <th className="py-3 px-4 text-right">Nominal</th>
                <th className="py-3 px-4 text-right">Saldo Berjalan</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2] text-sm">
              {visibleRows.map((entry) => {
                const isInflow = entry.direction === 'Masuk';
                return (
                  <tr key={entry.id} className="hover:bg-[#FAF8F5]/80 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs text-[#6E635C] tabular-nums">
                      <div className="font-mono font-medium text-[#1A1614]">{entry.id}</div>
                      <div>{formatWIB(entry.date)}</div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          isInflow ? 'text-[#15803D]' : 'text-[#B91C1C]'
                        }`}
                      >
                        {isInflow ? (
                          <ArrowDownLeft className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>Kas {entry.direction}</span>
                      </div>
                      <div className="text-xs text-[#6E635C] mt-0.5">{entry.category}</div>
                    </td>

                    <td className="py-3.5 px-4 text-xs text-[#1A1614] min-w-[240px]">
                      {entry.description}
                      {entry.linkedOrderId && (
                        <span className="ml-2 text-[11px] font-mono text-[#8C3B19]">
                          [Sinkron {entry.linkedOrderId}]
                        </span>
                      )}
                    </td>

                    <td
                      className={`py-3.5 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                        isInflow ? 'text-[#15803D]' : 'text-[#B91C1C]'
                      }`}
                    >
                      {isInflow ? '+' : '-'}
                      {formatIDR(entry.amount)}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#1A1614] whitespace-nowrap">
                      {formatIDR(entry.runningBalance)}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {entry.linkedOrderId ? (
                        <span className="text-[11px] text-[#8A7E75]">Auto</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDeleteEntry(entry.id)}
                          aria-label={`Hapus entri arus kas ${entry.id}`}
                          className="p-1.5 rounded-md text-[#8A7E75] hover:text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
