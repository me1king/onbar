'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { parseMerchantInventoryCsv } from '@/lib/merchantInventoryCsv';

type StockItem = {
  id: number;
  name: string;
  currentQuantity: number;
};

export type StockChange = {
  product_id: number;
  quantity: number;
  expected_quantity: number;
  lot_code: string;
  supplier_name: string;
  expiry_at: string | null;
  excise_stamp_confirmed: boolean;
  productName: string;
};

type RowResult = { row: number; productName: string; status: 'saved' | 'failed'; message: string };

const columns = [
  'product_id',
  'quantity',
  'expected_quantity',
  'lot_code',
  'supplier_name',
  'expiry_at',
  'excise_stamp_confirmed'
] as const;

function csvCell(value: string | number | boolean | null) {
  const text = value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number | boolean | null>>) {
  const blob = new Blob([rows.map(row => row.map(csvCell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MerchantInventoryCsv({
  items,
  alcoholMerchant,
  canOperate,
  onApply
}: {
  items: StockItem[];
  alcoholMerchant: boolean;
  canOperate: boolean;
  onApply: (change: StockChange) => Promise<boolean>;
}) {
  const [changes, setChanges] = useState<StockChange[]>([]);
  const [fileError, setFileError] = useState('');
  const [results, setResults] = useState<RowResult[]>([]);
  const [working, setWorking] = useState(false);
  const [unchangedRows, setUnchangedRows] = useState(0);
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

  function downloadTemplate() {
    downloadCsv('onbar-stock-template.csv', [
      [...columns],
      ['101', '12', '10', 'LOT-2026-001', 'Supplier name', '2027-12-31', alcoholMerchant ? 'true' : 'false']
    ]);
  }

  function downloadCurrentStock() {
    downloadCsv('onbar-merchant-stock.csv', [
      [...columns, 'product_name'],
      ...items.map(item => [
        item.id,
        item.currentQuantity,
        item.currentQuantity,
        '',
        '',
        '',
        false,
        item.name
      ])
    ]);
  }

  async function loadCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setChanges([]);
    setResults([]);
    setFileError('');
    setUnchangedRows(0);
    if (!file) return;
    if (file.size > 200_000) {
      setFileError('Choose a CSV smaller than 200 KB.');
      return;
    }
    try {
      const rows = parseMerchantInventoryCsv(await file.text());
      const header = rows.shift()?.map(value => value.toLowerCase());
      if (!header || header.length !== columns.length || columns.some((column, index) => header[index] !== column)) {
        throw new Error(`Use the template columns in this exact order: ${columns.join(', ')}.`);
      }
      if (rows.length === 0 || rows.length > 100) {
        throw new Error('The file must contain between 1 and 100 stock rows.');
      }
      const seen = new Set<number>();
      const parsed = rows.map((row, index): StockChange | null => {
        if (row.length !== columns.length) throw new Error(`Row ${index + 2} has the wrong number of columns.`);
        const [productText, quantityText, expectedText, lotCode, supplierName, expiryText, exciseText] = row;
        if (!/^[1-9]\d*$/.test(productText) || !/^(0|[1-9]\d*)$/.test(quantityText) || !/^(0|[1-9]\d*)$/.test(expectedText)) {
          throw new Error(`Row ${index + 2} needs positive product ID and whole-number quantity values.`);
        }
        const productId = Number(productText);
        const quantity = Number(quantityText);
        const expectedQuantity = Number(expectedText);
        const item = byId.get(productId);
        if (!item) throw new Error(`Row ${index + 2} uses product ${productId}, which is not in this merchant's approved catalog.`);
        if (seen.has(productId)) throw new Error(`Product ${productId} appears more than once. Keep one row per product.`);
        seen.add(productId);
        if (quantity > 1_000_000 || expectedQuantity > 1_000_000) {
          throw new Error(`Row ${index + 2} exceeds the one-million-unit stock limit.`);
        }
        if (expectedQuantity !== item.currentQuantity) {
          throw new Error(`Row ${index + 2} has stale expected stock for ${item.name}; download a fresh stock file.`);
        }
        if (lotCode.length > 120 || supplierName.length > 160) {
          throw new Error(`Row ${index + 2} has a lot code or supplier name that is too long.`);
        }
        const expiry = expiryText || null;
        if (expiry && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)
          || new Date(`${expiry}T00:00:00.000Z`).toISOString().slice(0, 10) !== expiry
          || expiry < new Date().toISOString().slice(0, 10))) {
          throw new Error(`Row ${index + 2} needs a valid expiry date that is not in the past.`);
        }
        if (!['true', 'false'].includes(exciseText.toLowerCase())) {
          throw new Error(`Row ${index + 2} must set excise_stamp_confirmed to true or false.`);
        }
        if (quantity > expectedQuantity && !lotCode) {
          throw new Error(`Row ${index + 2} adds stock and must include its real lot code.`);
        }
        if (alcoholMerchant && quantity > expectedQuantity && exciseText.toLowerCase() !== 'true') {
          throw new Error(`Row ${index + 2} adds alcohol stock and must attest to the excise stamp.`);
        }
        if (quantity === expectedQuantity) return null;
        return {
          product_id: productId,
          quantity,
          expected_quantity: expectedQuantity,
          lot_code: lotCode,
          supplier_name: supplierName,
          expiry_at: expiry,
          excise_stamp_confirmed: exciseText.toLowerCase() === 'true',
          productName: item.name
        };
      });
      const changedRows = parsed.filter((change): change is StockChange => change !== null);
      setChanges(changedRows);
      setUnchangedRows(parsed.length - changedRows.length);
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : 'The CSV file could not be read.');
    }
  }

  async function applyChanges() {
    setWorking(true);
    setFileError('');
    const rowResults: RowResult[] = [];
    for (const change of changes) {
      try {
        const saved = await onApply(change);
        if (!saved) throw new Error('The server rejected this row; review the terminal alert and refresh stock before retrying.');
        rowResults.push({
          row: change.product_id,
          productName: change.productName,
          status: 'saved',
          message: `Saved ${change.quantity} units.`
        });
      } catch (cause) {
        rowResults.push({
          row: change.product_id,
          productName: change.productName,
          status: 'failed',
          message: cause instanceof Error ? cause.message : 'Stock update failed.'
        });
      }
      setResults([...rowResults]);
    }
    setWorking(false);
    if (rowResults.every(result => result.status === 'saved')) setChanges([]);
  }

  return <section aria-labelledby="merchant-stock-csv" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div>
      <h3 id="merchant-stock-csv" className="font-black text-slate-900">Bulk stock by CSV</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">Download a current stock file, edit quantities, and preview before applying. Each row still goes through the audited stock ledger; increases require the real lot code and alcohol excise-stamp attestation.</p>
      <p className="mt-1 text-xs leading-5 text-amber-900">Price imports are not enabled: these legacy catalog price proposals affect the shared OnBar catalog and must not be presented as merchant-specific checkout prices.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={downloadTemplate} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><Download size={14} aria-hidden="true" /> CSV template</button>
      <button type="button" onClick={downloadCurrentStock} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><Download size={14} aria-hidden="true" /> Download current stock</button>
      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">
        <FileUp size={14} aria-hidden="true" /> Choose edited CSV
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={event => void loadCsv(event)} />
      </label>
    </div>
    {fileError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{fileError}</p>}
    {unchangedRows > 0 && <p role="status" className="text-xs text-slate-600">{unchangedRows} row{unchangedRows === 1 ? '' : 's'} already match current stock and will be skipped.</p>}
    {unchangedRows > 0 && changes.length === 0 && <p role="status" className="text-sm text-slate-600">No stock changes to apply.</p>}
    {changes.length > 0 && <div className="space-y-3">
      <p role="status" className="text-sm font-bold text-slate-800">{changes.length} valid stock change{changes.length === 1 ? '' : 's'} ready for preview.</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Product</th><th className="p-3">Current</th><th className="p-3">New</th><th className="p-3">Lot / expiry</th></tr></thead>
          <tbody>{changes.map(change => <tr key={change.product_id} className="border-t border-slate-100"><td className="p-3 font-bold">{change.productName}</td><td className="p-3">{change.expected_quantity}</td><td className="p-3">{change.quantity}</td><td className="p-3">{change.lot_code || 'Existing lots'}{change.expiry_at ? ` · ${change.expiry_at}` : ''}</td></tr>)}</tbody>
        </table>
      </div>
      <button type="button" disabled={working || !canOperate} onClick={() => void applyChanges()} className="min-h-11 rounded-lg bg-amber-400 px-4 py-2 text-xs font-black uppercase text-slate-950 disabled:opacity-50">{working ? 'Applying stock rows…' : canOperate ? 'Apply previewed stock changes' : 'Merchant approval required'}</button>
    </div>}
    {results.length > 0 && <ul aria-label="CSV stock update results" className="space-y-2">
      {results.map(result => <li key={result.row} className={`rounded-lg p-3 text-xs ${result.status === 'saved' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}><strong>{result.productName}</strong> · {result.message}</li>)}
      {working && <li role="status" className="text-xs text-slate-500">The import is running row by row. Successful updates remain saved if a later row fails.</li>}
    </ul>}
  </section>;
}
