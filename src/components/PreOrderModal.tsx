import { useMemo, useState } from 'react';
import { Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { EXTRA_SHOT_PRICE, MENU_CATALOG } from '../data/catalog';
import type {
  DeliveryMethod,
  IceLevel,
  MenuCategory,
  MenuItem,
  OrderItem,
  PaymentMethod,
  PaymentStatus,
  SalesOrder,
  SugarLevel,
} from '../types/dshyt';
import {
  calculateOrderItemSubtotal,
  calculateOrderTotals,
  formatIDR,
} from '../utils/ledger';

interface PreOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateOrder: (
    orderInput: Omit<SalesOrder, 'id' | 'createdAt'>,
    openInvoiceAfter: boolean
  ) => void;
}

const CATEGORIES: ('Semua' | MenuCategory)[] = [
  'Semua',
  'Signature & Susu',
  'Espresso & Black',
  'Citrus & Sparkling',
];

export function PreOrderModal({
  isOpen,
  onClose,
  onCreateOrder,
}: PreOrderModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'Semua' | MenuCategory>('Semua');

  const [cart, setCart] = useState<OrderItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>('Delivery — Area Kampus');
  const [locationDetail, setLocationDetail] = useState('');
  const [courierNote, setCourierNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('QR / QRIS');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Lunas');
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [openInvoiceAfter, setOpenInvoiceAfter] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState('');

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return MENU_CATALOG.filter((item) => {
      if (selectedCategory !== 'Semua' && item.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, selectedCategory]);

  const { itemsSubtotal, totalAmount } = useMemo(
    () => calculateOrderTotals(cart, shippingFee, discount),
    [cart, shippingFee, discount]
  );

  if (!isOpen) return null;

  function addMenuItem(menu: MenuItem) {
    setErrorMsg('');
    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) =>
          item.skuId === menu.id &&
          !item.extraShot &&
          item.iceLevel === 'Normal Ice' &&
          item.sugarLevel === 'Normal Sugar'
      );
      if (existingIdx >= 0) {
        const next = [...prev];
        const target = next[existingIdx];
        const newQty = target.qty + 1;
        next[existingIdx] = {
          ...target,
          qty: newQty,
          subtotal: calculateOrderItemSubtotal(target.unitPrice, newQty, target.extraShot),
        };
        return next;
      }

      const newItem: OrderItem = {
        id: `${menu.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        skuId: menu.id,
        name: menu.name,
        category: menu.category,
        qty: 1,
        unitPrice: menu.price,
        extraShot: false,
        iceLevel: 'Normal Ice',
        sugarLevel: 'Normal Sugar',
        subtotal: menu.price,
      };
      return [...prev, newItem];
    });
  }

  function updateItem(
    itemId: string,
    patch: Partial<Pick<OrderItem, 'qty' | 'extraShot' | 'iceLevel' | 'sugarLevel'>>
  ) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== itemId) return item;
          const nextQty = patch.qty !== undefined ? patch.qty : item.qty;
          if (nextQty <= 0) return null;
          const nextShot = patch.extraShot !== undefined ? patch.extraShot : item.extraShot;
          return {
            ...item,
            ...patch,
            qty: nextQty,
            extraShot: nextShot,
            subtotal: calculateOrderItemSubtotal(item.unitPrice, nextQty, nextShot),
          };
        })
        .filter((x): x is OrderItem => x !== null)
    );
  }

  function handleDeliveryChange(nextMethod: DeliveryMethod) {
    setDeliveryMethod(nextMethod);
    if (nextMethod === 'Delivery — Luar Kampus / Kos' && shippingFee === 0) {
      setShippingFee(3000);
    } else if (nextMethod !== 'Delivery — Luar Kampus / Kos' && shippingFee === 3000) {
      setShippingFee(0);
    }
  }

  function resetForm() {
    setCart([]);
    setCustomerName('');
    setWhatsapp('');
    setDeliveryMethod('Delivery — Area Kampus');
    setLocationDetail('');
    setCourierNote('');
    setPaymentMethod('QR / QRIS');
    setPaymentStatus('Lunas');
    setShippingFee(0);
    setDiscount(0);
    setErrorMsg('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) {
      setErrorMsg('Pilih minimal 1 menu Kopi D’SHYT sebelum mencatat pesanan.');
      return;
    }
    if (!customerName.trim()) {
      setErrorMsg('Nama Lengkap pemesan wajib diisi.');
      return;
    }
    if (!whatsapp.trim()) {
      setErrorMsg('Nomor WhatsApp pemesan wajib diisi.');
      return;
    }

    onCreateOrder(
      {
        customerName: customerName.trim(),
        whatsapp: whatsapp.trim(),
        deliveryMethod,
        locationDetail: locationDetail.trim(),
        courierNote: courierNote.trim(),
        paymentMethod,
        paymentStatus,
        items: cart,
        itemsSubtotal,
        shippingFee,
        discount,
        totalAmount,
      },
      openInvoiceAfter
    );

    resetForm();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1A1614]/50 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preorder-modal-title"
    >
      <div className="bg-[#FAF8F5] border border-[#E8E2DA] rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 bg-white border-b border-[#E8E2DA] flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-[#8C3B19] uppercase tracking-wider">
              Sinkronisasi Alur Pre-Order Kopi D'SHYT
            </p>
            <h2
              id="preorder-modal-title"
              className="font-display text-xl font-bold text-[#1A1614]"
            >
              Catat Pesanan Pre-Order Baru
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form catat pesanan"
            className="p-2 rounded-lg text-[#6E635C] hover:text-[#1A1614] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Two-Column Integrated Catalog + Checkout Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          {/* Left: 11 Menu Items from Reference Site */}
          <div className="lg:col-span-7 p-5 sm:p-6 space-y-4 border-b lg:border-b-0 lg:border-r border-[#E8E2DA]">
            <div className="space-y-3">
              <div className="relative w-full">
                <Search
                  className="w-3.5 h-3.5 text-[#8A7E75] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Cari menu pre-order"
                  placeholder="Cari menu Kopi D'SHYT..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:border-[#C2410C]"
                />
              </div>

              <div
                className="flex flex-wrap items-center gap-1 p-1 bg-[#EFEAE2] rounded-lg"
                role="tablist"
                aria-label="Filter kategori menu pre-order"
              >
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={selectedCategory === cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-white text-[#1A1614] shadow-xs'
                        : 'text-[#6E635C] hover:text-[#1A1614]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredCatalog.map((menu) => (
                <article
                  key={menu.id}
                  className="bg-white border border-[#E8E2DA] rounded-xl p-3.5 flex flex-col justify-between gap-3"
                >
                  <div>
                    <p className="text-[11px] font-medium text-[#8C3B19]">{menu.category}</p>
                    <h3 className="font-display text-base font-bold text-[#1A1614] mt-0.5">
                      {menu.name}
                    </h3>
                    <p className="text-xs text-[#6E635C] mt-1 line-clamp-2">
                      {menu.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#F3EFE9]">
                    <span className="font-mono tabular-nums text-sm font-semibold text-[#1A1614]">
                      {formatIDR(menu.price)}
                    </span>
                    <button
                      type="button"
                      onClick={() => addMenuItem(menu)}
                      aria-label={`Tambah ${menu.name}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1A1614] hover:bg-[#C2410C] text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Tambah</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* Right: Ringkasan Pesanan & Checkout Form */}
          <form onSubmit={handleSubmit} className="lg:col-span-5 p-5 sm:p-6 bg-white space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#1A1614] flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
                <span>Ringkasan Pesanan</span>
              </h3>
              <span className="text-xs font-mono text-[#6E635C]">
                {cart.reduce((s, i) => s + i.qty, 0)} item
              </span>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2"
              >
                {errorMsg}
              </div>
            )}

            {/* Cart Items */}
            {cart.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-dashed border-[#D5CBC0] text-xs text-[#6E635C]">
                Belum ada menu dipilih. Tekan tombol <strong>Tambah</strong> pada daftar menu
                untuk mengatur es, gula, dan ekstra shot.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {cart.map((item) => {
                  const catalogMeta = MENU_CATALOG.find((m) => m.id === item.skuId);
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg bg-[#FAF8F5] border border-[#E8E2DA] space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-[#1A1614]">{item.name}</div>
                          <div className="font-mono text-[11px] text-[#6E635C]">
                            {formatIDR(item.subtotal)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { qty: item.qty - 1 })}
                            aria-label={`Kurangi jumlah ${item.name}`}
                            className="w-6 h-6 rounded border border-[#D5CBC0] bg-white flex items-center justify-center text-[#1A1614] cursor-pointer"
                          >
                            <Minus className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <span className="font-mono text-xs font-semibold w-5 text-center">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { qty: item.qty + 1 })}
                            aria-label={`Tambah jumlah ${item.name}`}
                            className="w-6 h-6 rounded border border-[#D5CBC0] bg-white flex items-center justify-center text-[#1A1614] cursor-pointer"
                          >
                            <Plus className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { qty: 0 })}
                            aria-label={`Hapus ${item.name} dari keranjang`}
                            className="p-1 text-[#8A7E75] hover:text-[#B91C1C] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {catalogMeta?.supportsIceSugar && (
                          <>
                            <select
                              aria-label={`Level es ${item.name}`}
                              value={item.iceLevel}
                              onChange={(e) =>
                                updateItem(item.id, { iceLevel: e.target.value as IceLevel })
                              }
                              className="px-2 py-1 text-[11px] bg-white border border-[#E2D9CE] rounded text-[#1A1614]"
                            >
                              <option value="Normal Ice">Normal Ice</option>
                              <option value="Less Ice">Less Ice</option>
                              <option value="No Ice">No Ice</option>
                            </select>

                            <select
                              aria-label={`Level gula ${item.name}`}
                              value={item.sugarLevel}
                              onChange={(e) =>
                                updateItem(item.id, { sugarLevel: e.target.value as SugarLevel })
                              }
                              className="px-2 py-1 text-[11px] bg-white border border-[#E2D9CE] rounded text-[#1A1614]"
                            >
                              <option value="Normal Sugar">Normal Sugar</option>
                              <option value="Less Sugar">Less Sugar</option>
                              <option value="No Sugar">No Sugar</option>
                            </select>
                          </>
                        )}

                        {catalogMeta?.supportsEspressoShot && (
                          <label className="inline-flex items-center gap-1 text-[11px] text-[#1A1614] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.extraShot}
                              onChange={(e) =>
                                updateItem(item.id, { extraShot: e.target.checked })
                              }
                              className="accent-[#C2410C]"
                            />
                            <span>+Extra Shot ({formatIDR(EXTRA_SHOT_PRICE)})</span>
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Buyer & Delivery Information (Matching reference site) */}
            <div className="space-y-3 pt-2 border-t border-[#EFEAE2]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E635C]">
                Informasi Pemesan &amp; Pengiriman
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="po-name"
                    className="block text-xs font-semibold text-[#1A1614] mb-1"
                  >
                    Nama Lengkap
                  </label>
                  <input
                    id="po-name"
                    type="text"
                    placeholder="Contoh: Bayu Satrio"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:bg-white focus:border-[#C2410C]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="po-wa"
                    className="block text-xs font-semibold text-[#1A1614] mb-1"
                  >
                    Nomor WhatsApp
                  </label>
                  <input
                    id="po-wa"
                    type="tel"
                    placeholder="Contoh: 081234567890"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:bg-white focus:border-[#C2410C]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="po-delivery"
                  className="block text-xs font-semibold text-[#1A1614] mb-1"
                >
                  Metode Pengiriman
                </label>
                <select
                  id="po-delivery"
                  value={deliveryMethod}
                  onChange={(e) => handleDeliveryChange(e.target.value as DeliveryMethod)}
                  className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:bg-white focus:border-[#C2410C]"
                >
                  <option value="Delivery — Area Kampus">Delivery — Area Kampus</option>
                  <option value="Delivery — Luar Kampus / Kos">
                    Delivery — Luar Kampus / Kos
                  </option>
                  <option value="Ambil di Tempat (Pick-Up)">Ambil di Tempat (Pick-Up)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="po-location"
                  className="block text-xs font-semibold text-[#1A1614] mb-1"
                >
                  Detail Lokasi / Gedung Kampus
                </label>
                <input
                  id="po-location"
                  type="text"
                  placeholder="Contoh: Fakultas Teknik / Gedung Kuliah Lt. 2"
                  value={locationDetail}
                  onChange={(e) => setLocationDetail(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:bg-white focus:border-[#C2410C]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="po-shipping"
                    className="block text-xs font-semibold text-[#1A1614] mb-1"
                  >
                    Ongkir (Rp)
                  </label>
                  <input
                    id="po-shipping"
                    type="number"
                    min={0}
                    step={500}
                    value={shippingFee}
                    onChange={(e) => setShippingFee(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-xs font-mono bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:bg-white focus:border-[#C2410C]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="po-discount"
                    className="block text-xs font-semibold text-[#1A1614] mb-1"
                  >
                    Diskon (Rp)
                  </label>
                  <input
                    id="po-discount"
                    type="number"
                    min={0}
                    step={500}
                    value={discount}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-xs font-mono bg-[#FAF8F5] border border-[#E2D9CE] rounded-lg text-[#1A1614] focus:outline-none focus:bg-white focus:border-[#C2410C]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-xs font-semibold text-[#1A1614] mb-1">
                    Metode Pembayaran
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['Cash', 'QR / QRIS'] as PaymentMethod[]).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`py-2 px-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          paymentMethod === method
                            ? 'bg-[#1A1614] text-white border-[#1A1614]'
                            : 'bg-[#FAF8F5] text-[#1A1614] border-[#E2D9CE]'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-[#1A1614] mb-1">
                    Status Pembayaran
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['Lunas', 'Pending'] as PaymentStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setPaymentStatus(st)}
                        className={`py-2 px-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          paymentStatus === st
                            ? st === 'Lunas'
                              ? 'bg-[#15803D] text-white border-[#15803D]'
                              : 'bg-[#B45309] text-white border-[#B45309]'
                            : 'bg-[#FAF8F5] text-[#1A1614] border-[#E2D9CE]'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-[#6E635C] cursor-pointer">
                <input
                  type="checkbox"
                  checked={openInvoiceAfter}
                  onChange={(e) => setOpenInvoiceAfter(e.target.checked)}
                  className="accent-[#C2410C]"
                />
                <span>Langsung buka Generator Nota Digital setelah disimpan</span>
              </label>

              <div className="pt-3 border-t border-[#EFEAE2] flex items-center justify-between">
                <div>
                  <div className="text-xs text-[#6E635C]">Total Pembayaran</div>
                  <div className="font-mono tabular-nums text-xl font-bold text-[#1A1614]">
                    {formatIDR(totalAmount)}
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-[#C2410C] hover:bg-[#A33609] text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  Simpan Pesanan
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
