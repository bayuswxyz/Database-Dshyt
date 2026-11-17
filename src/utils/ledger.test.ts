import test from 'node:test';
import assert from 'node:assert/strict';
import { MENU_CATALOG, SEED_CASHFLOW, SEED_ORDERS } from '../data/catalog';
import {
  buildWhatsAppInvoiceText,
  calculateOrderItemSubtotal,
  calculateOrderTotals,
  computeCashflowWithBalance,
  computeProductBreakdown,
  formatIDR,
  formatWIB,
  generateNextOrderId,
  summarizeSales,
  syncOrderToCashflow,
} from './ledger';

test('formatIDR formats Indonesian Rupiah accurately', () => {
  assert.equal(formatIDR(0), 'Rp 0');
  assert.equal(formatIDR(13000), 'Rp 13.000');
  assert.equal(formatIDR(1250000), 'Rp 1.250.000');
  assert.equal(formatIDR(-45000), '-Rp 45.000');
});

test('formatWIB converts UTC timestamp to Asia/Jakarta WIB', () => {
  const formatted = formatWIB('2026-11-17T03:15:00.000Z');
  assert.ok(formatted.includes('WIB'));
  assert.ok(formatted.includes('10:15') || formatted.includes('10.15'));
});

test('order item and order total calculations handle extra shot, shipping, and discount', () => {
  const sub = calculateOrderItemSubtotal(18000, 2, true, 3000);
  assert.equal(sub, 42000);

  const totals = calculateOrderTotals(
    [
      {
        id: '1',
        skuId: 'espresso-pouch',
        name: 'Espresso Pouch',
        category: 'Espresso & Black',
        qty: 2,
        unitPrice: 10000,
        extraShot: false,
        iceLevel: 'Normal Ice',
        sugarLevel: 'Normal Sugar',
        subtotal: 20000,
      },
    ],
    3000,
    5000
  );
  assert.equal(totals.itemsSubtotal, 20000);
  assert.equal(totals.totalAmount, 18000);

  const clamped = calculateOrderTotals([], 0, 5000);
  assert.equal(clamped.totalAmount, 0);
});

test('summarizeSales aggregates omzet, paid vs pending, and total units', () => {
  const summary = summarizeSales(SEED_ORDERS);
  assert.equal(summary.totalOrders, SEED_ORDERS.length);
  assert.equal(summary.paidOmzet + summary.pendingOmzet, summary.totalOmzet);
  assert.equal(summary.paidCount + summary.pendingCount, summary.totalOrders);
  assert.ok(summary.totalUnits > 0);
});

test('computeProductBreakdown groups SUMIF qty and revenue and sums percentage near 100%', () => {
  const breakdown = computeProductBreakdown(SEED_ORDERS, MENU_CATALOG, false);
  assert.equal(breakdown.length, MENU_CATALOG.length);

  const espressoPouch = breakdown.find((r) => r.skuId === 'espresso-pouch');
  assert.ok(espressoPouch);
  assert.equal(espressoPouch.unitsSold, 8);
  assert.equal(espressoPouch.totalRevenue, 80000);

  const totalPct = breakdown.reduce((sum, r) => sum + r.revenueSharePct, 0);
  assert.ok(totalPct > 99 && totalPct <= 101);
});

test('computeCashflowWithBalance calculates chronological running balance accurately', () => {
  const { rows, summary } = computeCashflowWithBalance(SEED_CASHFLOW);
  assert.equal(rows.length, SEED_CASHFLOW.length);
  assert.equal(summary.netBalance, summary.totalInflow - summary.totalOutflow);
  assert.equal(rows[rows.length - 1].runningBalance, summary.netBalance);
});

test('syncOrderToCashflow adds on Lunas and removes when reverted to Pending', () => {
  const pendingOrder = SEED_ORDERS.find((o) => o.paymentStatus === 'Pending');
  assert.ok(pendingOrder);

  const paidVersion = { ...pendingOrder, paymentStatus: 'Lunas' as const };
  const afterPaid = syncOrderToCashflow(paidVersion, SEED_CASHFLOW);
  assert.equal(
    afterPaid.filter((e) => e.linkedOrderId === pendingOrder.id).length,
    1
  );

  // Idempotent when called twice
  const afterPaidAgain = syncOrderToCashflow(paidVersion, afterPaid);
  assert.equal(
    afterPaidAgain.filter((e) => e.linkedOrderId === pendingOrder.id).length,
    1
  );

  // Removed when toggled back to Pending
  const afterReverted = syncOrderToCashflow(pendingOrder, afterPaidAgain);
  assert.equal(
    afterReverted.filter((e) => e.linkedOrderId === pendingOrder.id).length,
    0
  );
});

test('generateNextOrderId increments highest existing order sequence', () => {
  assert.equal(generateNextOrderId(SEED_ORDERS), '#DSHYT-8822');
});

test('buildWhatsAppInvoiceText formats invoice details clearly', () => {
  const text = buildWhatsAppInvoiceText(SEED_ORDERS[0]);
  assert.ok(text.includes('#DSHYT-8821'));
  assert.ok(text.includes('Nadia Kusuma'));
  assert.ok(text.includes('LUNAS'));
});
