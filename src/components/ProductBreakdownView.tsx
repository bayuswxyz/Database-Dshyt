import { useMemo, useState } from 'react';
import { MENU_CATALOG } from '../data/catalog';
import type { MenuCategory, SalesOrder } from '../types/dshyt';
import { computeProductBreakdown, formatIDR } from '../utils/ledger';

interface ProductBreakdownViewProps {
  orders: SalesOrder[];
}

const CATEGORIES: ('Semua' | MenuCategory)[] = [
  'Semua',
  'Signature & Susu',
  'Espresso & Black',
  'Citrus & Sparkling',
];

export function ProductBreakdownView({ orders }: ProductBreakdownViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<'Semua' | MenuCategory>('Semua');
  const [onlyPaid, setOnlyPaid] = useState(false);

  const allRows = useMemo(
    () => computeProductBreakdown(orders, MENU_CATALOG, onlyPaid),
    [orders, onlyPaid]
  );

  const visibleRows = useMemo(() => {
    if (selectedCategory === 'Semua') return allRows;
    return allRows.filter((row) => row.category === selectedCategory);
  }, [allRows, selectedCategory]);

  const totals = useMemo(() => {
    const units = visibleRows.reduce((s, r) => s + r.unitsSold, 0);
    const revenue = visibleRows.reduce((s, r) => s + r.totalRevenue, 0);
    const topSku = [...allRows].sort((a, b) => b.unitsSold - a.unitsSold)[0];
    return { units, revenue, topSku };
  }, [visibleRows, allRows]);

  const categoryStats = useMemo(() => {
    const map: Record<MenuCategory, { units: number; revenue: number }> = {
      'Signature & Susu': { units: 0, revenue: 0 },
      'Espresso & Black': { units: 0, revenue: 0 },
      'Citrus & Sparkling': { units: 0, revenue: 0 },
    };
    for (const row of allRows) {
      map[row.category].units += row.unitsSold;
      map[row.category].revenue += row.totalRevenue;
    }
    return map;
  }, [allRows]);

  return (
    <section aria-labelledby="products-heading" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#8C3B19] tracking-wide">
            Agregasi Varian SKU · 11 Menu Kopi D'SHYT
          </p>
          <h1
            id="products-heading"
            className="font-display text-2xl sm:text-3xl font-bold text-[#1A1614] tracking-tight mt-1"
          >
            Analisis Produk Terjual
          </h1>
        </div>

        <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-[#1A1614] bg-white border border-[#E8E2DA] px-3.5 py-2 rounded-lg cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyPaid}
            onChange={(e) => setOnlyPaid(e.target.checked)}
            className="accent-[#C2410C] w-4 h-4 rounded"
          />
          <span>Hanya hitung pesanan Lunas</span>
        </label>
      </div>

      {/* Category & Top SKU Highlight Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E8E2DA] rounded-xl p-4">
          <p className="text-xs font-medium text-[#6E635C]">Varian Terlaris</p>
          <p className="font-display text-lg font-bold text-[#1A1614] mt-1.5 truncate">
            {totals.topSku && totals.topSku.unitsSold > 0 ? totals.topSku.name : 'Belum ada data'}
          </p>
          <p className="text-xs text-[#6E635C] mt-1 font-mono tabular-nums">
            {totals.topSku ? `${totals.topSku.unitsSold} unit · ${formatIDR(totals.topSku.totalRevenue)}` : '-'}
          </p>
        </div>

        {(['Espresso & Black', 'Signature & Susu', 'Citrus & Sparkling'] as MenuCategory[]).map(
          (cat) => (
            <div key={cat} className="bg-white border border-[#E8E2DA] rounded-xl p-4">
              <p className="text-xs font-medium text-[#6E635C]">{cat}</p>
              <p className="font-mono tabular-nums text-xl font-semibold text-[#1A1614] mt-1.5">
                {formatIDR(categoryStats[cat].revenue)}
              </p>
              <p className="text-xs text-[#6E635C] mt-1 font-mono tabular-nums">
                {categoryStats[cat].units} unit terjual
              </p>
            </div>
          )
        )}
      </div>

      {/* Category Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex items-center gap-1 p-1 bg-[#EFEAE2] rounded-lg overflow-x-auto"
          role="tablist"
          aria-label="Filter kategori produk"
        >
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={selectedCategory === category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === category
                  ? 'bg-white text-[#1A1614] shadow-xs'
                  : 'text-[#6E635C] hover:text-[#1A1614]'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        <p className="text-xs text-[#6E635C] font-mono tabular-nums">
          Subtotal Tampil: {totals.units} unit · {formatIDR(totals.revenue)}
        </p>
      </div>

      {/* SKU Breakdown Table */}
      <div className="bg-white border border-[#E8E2DA] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E8E2DA] bg-[#FAF8F5] text-[11px] font-semibold text-[#6E635C] uppercase tracking-wider">
                <th className="py-3 px-4">Varian Produk</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4 text-right">Harga Dasar</th>
                <th className="py-3 px-4 text-right">Unit Terjual</th>
                <th className="py-3 px-4 text-right">Total Pendapatan</th>
                <th className="py-3 px-4 min-w-[200px]">Kontribusi Omzet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2] text-sm">
              {visibleRows.map((row) => (
                <tr key={row.skuId} className="hover:bg-[#FAF8F5]/80 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-[#1A1614] whitespace-nowrap">
                    {row.name}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-[#6E635C] whitespace-nowrap">
                    {row.category}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-[#6E635C] whitespace-nowrap">
                    {formatIDR(row.unitPrice)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#1A1614] whitespace-nowrap">
                    {row.unitsSold}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#1A1614] whitespace-nowrap">
                    {formatIDR(row.totalRevenue)}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-[#F3EFE9] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#C2410C] rounded-full transition-all duration-200"
                          style={{ width: `${Math.min(100, row.revenueSharePct)}%` }}
                        />
                      </div>
                      <span className="font-mono tabular-nums text-xs font-medium text-[#1A1614] w-12 text-right">
                        {row.revenueSharePct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#E8E2DA] bg-[#FAF8F5] font-semibold text-sm">
                <td className="py-3 px-4 text-[#1A1614]" colSpan={3}>
                  Total ({visibleRows.length} SKU)
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-[#1A1614]">
                  {totals.units}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-[#1A1614]">
                  {formatIDR(totals.revenue)}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-[#6E635C]">
                  {visibleRows.reduce((s, r) => s + r.revenueSharePct, 0).toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
