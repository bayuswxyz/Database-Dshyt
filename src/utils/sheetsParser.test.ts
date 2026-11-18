import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSheetRowUpdatePayload,
  extractSpreadsheetId,
  findBestMatchingSpreadsheet,
  parseCSVText,
  parseOrderItemsString,
  parseOrderStatus,
  parseSheetTimestampWIB,
  parseSheetValuesToOrders,
  serializeOrderToSheetRow,
} from './sheetsParser';

test('findBestMatchingSpreadsheet prioritizes Kopi DSHYT database spreadsheet', () => {
  const matched = findBestMatchingSpreadsheet([
    { id: '1', name: 'Catatan Keuangan Pribadi' },
    { id: '2', name: 'Database_Pesanan_Kopi_D_SHYT' },
    { id: '3', name: 'Template Kosong' },
  ]);
  assert.equal(matched?.id, '2');

  const single = findBestMatchingSpreadsheet([{ id: '9', name: 'Sheet Tunggal' }]);
  assert.equal(single?.id, '9');

  const ambiguous = findBestMatchingSpreadsheet([
    { id: 'a', name: 'Budget 2026' },
    { id: 'b', name: 'Daftar Kontak' },
  ]);
  assert.equal(ambiguous, null);
});

test('extractSpreadsheetId parses full Google Sheets URLs and raw IDs', () => {
  assert.equal(
    extractSpreadsheetId(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0'
    ),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
  );
  assert.equal(
    extractSpreadsheetId('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
  );
  assert.equal(extractSpreadsheetId('invalid'), null);
});

test('parseSheetTimestampWIB converts DD/MM/YYYY H:mm:ss WIB to valid ISO string', () => {
  const iso = parseSheetTimestampWIB('17/11/2026 6:42:14');
  assert.equal(iso, '2026-11-16T23:42:14.000Z');
});

test('parseOrderStatus normalizes Diterima, Proses, and Selesai variants', () => {
  assert.equal(parseOrderStatus(''), 'Diterima');
  assert.equal(parseOrderStatus('diterima'), 'Diterima');
  assert.equal(parseOrderStatus('Proses'), 'Proses');
  assert.equal(parseOrderStatus('Sedang Diproses'), 'Proses');
  assert.equal(parseOrderStatus('Selesai'), 'Selesai');
  assert.equal(parseOrderStatus('Done'), 'Selesai');
});

test('parseOrderItemsString maps Dshyt name variants and multiple items accurately', () => {
  const { items, itemNotes } = parseOrderItemsString(
    'Orange Blanc Dshyt (2x: Normal Ice, Normal Sugar) | Coffee Milk DSHYT (1x: Normal Ice, Less Sugar, Catatan: Less Sweet)',
    'test'
  );
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Orange Blanc D'SHYT");
  assert.equal(items[0].qty, 2);
  assert.equal(items[0].subtotal, 24000);
  assert.equal(items[1].name, "Coffee Milk D'SHYT");
  assert.equal(items[1].sugarLevel, 'Less Sugar');
  assert.equal(itemNotes[0], "Coffee Milk D'SHYT: Less Sweet");
});

test('parseSheetValuesToOrders accurately parses attached Database_Pesanan_Kopi_D_SHYT CSV', () => {
  const csvPath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/Database_Pesanan_Kopi_D_SHYT_d1296e85'
  );
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const values = parseCSVText(csvText);
  const { orders, statusColumnLetter, orderStatusColumnLetter, hasOrderStatusHeader } =
    parseSheetValuesToOrders(values);

  assert.equal(statusColumnLetter, 'J');
  assert.equal(orderStatusColumnLetter, 'M');
  assert.equal(hasOrderStatusHeader, false);
  // 42 lines: 1 header + 2 template rows + 2 blank + 1 total batch row = 6 non-order rows => 36 orders!
  assert.equal(orders.length, 36);

  const maria = orders.find((o) => o.customerName === 'Maria Adella');
  assert.ok(maria);
  assert.equal(maria.sheetRowIndex, 4);
  assert.equal(maria.paymentStatus, 'Lunas');
  assert.equal(maria.orderStatus, 'Diterima');
  assert.equal(maria.totalAmount, 36000);
  assert.equal(maria.whatsapp, '087879029664');

  const buBella = orders.find((o) => o.customerName === 'Bu bella');
  assert.ok(buBella);
  assert.equal(buBella.paymentStatus, 'Lunas'); // case-insensitive "lunas"

  const desiGroup = orders.find((o) => o.customerName.includes('Desi'));
  assert.ok(desiGroup);
  assert.equal(desiGroup.items.length, 4);
  assert.equal(desiGroup.totalAmount, 69000);
  assert.equal(desiGroup.deliveryMethod, 'Delivery — Luar Kampus / Kos');

  const brigitta = orders.find((o) => o.customerName === 'Brigitta');
  assert.ok(brigitta);
  assert.equal(brigitta.sheetRowIndex, 42);
  assert.equal(brigitta.paymentMethod, 'Cash');
  assert.equal(brigitta.paymentStatus, 'Pending');
});

test('parseSheetValuesToOrders detects Status Pemesanan column when present in sheet', () => {
  const values = [
    [
      'Timestamp',
      'Nama',
      'WhatsApp',
      'Pesanan',
      'Total',
      'Pengiriman',
      'Alamat',
      'Catatan',
      'Metode Pembayaran',
      'Status Pembayaran',
      'Bukti Pembayaran',
      'Preview Gambar',
      'Status Pemesanan',
    ],
    [
      '17/11/2026 10:00:00',
      'Bima',
      '8123456789',
      'Espresso Pouch (2x: Normal Ice, Normal Sugar)',
      'Rp20.000',
      'Delivery (Kampus)',
      'Gd A',
      '-',
      'QR',
      'Lunas',
      '-',
      '-',
      'Proses',
    ],
  ];
  const parsed = parseSheetValuesToOrders(values);
  assert.equal(parsed.hasOrderStatusHeader, true);
  assert.equal(parsed.orderStatusColumnLetter, 'M');
  assert.equal(parsed.orders[0].orderStatus, 'Proses');
});

test('serializeOrderToSheetRow and buildSheetRowUpdatePayload preserve Bukti/Preview and write Status Pemesanan', () => {
  const csvPath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/Database_Pesanan_Kopi_D_SHYT_d1296e85'
  );
  const values = parseCSVText(fs.readFileSync(csvPath, 'utf8'));
  const { orders, columnIndices } = parseSheetValuesToOrders(values);
  const edited = { ...orders[0], orderStatus: 'Selesai' as const };

  const row = serializeOrderToSheetRow(edited, columnIndices);
  assert.equal(row.length, 13);
  assert.ok(row[4].startsWith('Rp'));
  assert.equal(row[12], 'Selesai');

  const updatesMissingHeader = buildSheetRowUpdatePayload(edited, 42, columnIndices);
  assert.equal(updatesMissingHeader.length, 3);
  assert.equal(updatesMissingHeader[0].rangeA1, 'A42:J42');
  assert.equal(updatesMissingHeader[1].rangeA1, 'M1');
  assert.deepEqual(updatesMissingHeader[1].values, [['Status Pemesanan']]);
  assert.equal(updatesMissingHeader[2].rangeA1, 'M42');
  assert.deepEqual(updatesMissingHeader[2].values, [['Selesai']]);

  const updatesWithHeader = buildSheetRowUpdatePayload(edited, 42, {
    ...columnIndices,
    hasOrderStatusHeader: true,
  });
  assert.equal(updatesWithHeader.length, 2);
  assert.equal(updatesWithHeader[0].rangeA1, 'A42:J42');
  assert.equal(updatesWithHeader[1].rangeA1, 'M42');
});
