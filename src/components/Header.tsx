import { Plus } from 'lucide-react';
import type { ActiveTab } from '../types/dshyt';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenNewOrder: () => void;
}

const NAV_ITEMS: { id: ActiveTab; label: string }[] = [
  { id: 'sales', label: 'Penjualan' },
  { id: 'products', label: 'Produk' },
  { id: 'cashflow', label: 'Arus Kas' },
  { id: 'invoice', label: 'Nota Digital' },
];

export function Header({ activeTab, onSelectTab, onOpenNewOrder }: HeaderProps) {
  return (
    <header className="bg-[#FAF8F5] border-b border-[#E8E2DA]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('sales');
          }}
          className="font-display text-xl font-bold tracking-tight text-[#1A1614] whitespace-nowrap shrink-0"
        >
          Kopi D'SHYT
        </a>

        <nav
          aria-label="Navigasi modul"
          className="hidden md:flex items-center gap-7"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                  isActive
                    ? 'text-[#1A1614] border-[#C2410C] font-semibold'
                    : 'text-[#6E635C] border-transparent hover:text-[#1A1614] hover:border-[#D5CBC0]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenNewOrder}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#C2410C] hover:bg-[#A33609] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Catat Pesanan</span>
          </button>
        </div>
      </div>

      <nav
        aria-label="Navigasi modul mobile"
        className="flex md:hidden items-center gap-4 px-4 pb-2.5 overflow-x-auto border-t border-[#EFEAE2]"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`pt-2 pb-1 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                isActive
                  ? 'text-[#1A1614] border-[#C2410C] font-semibold'
                  : 'text-[#6E635C] border-transparent'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
