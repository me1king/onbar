'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type CatalogProduct = {
  id: number;
  name: string;
  price: number;
};

type Props = {
  orderItem: {
    id: number;
    quantity: number;
    unit_price: number;
    size?: string;
  };
  products: CatalogProduct[];
  onSaved: () => void;
};

export default function UnlinkedOrderItemRepair({ orderItem, products, onSaved }: Props) {
  const [productId, setProductId] = useState('');
  const [confirmationNote, setConfirmationNote] = useState('');
  const [customerConfirmed, setCustomerConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = products.find(product => Number(product.id) === Number(productId));
  const savedPrice = Number(orderItem.unit_price);
  const currentPrice = selectedProduct ? Number(selectedProduct.price) : null;
  const priceDiffers = currentPrice !== null
    && Number.isFinite(savedPrice)
    && Math.abs(currentPrice - savedPrice) > 0.01;

  const repairItem = async () => {
    if (!selectedProduct || !customerConfirmed || confirmationNote.trim().length < 8) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'repair_unlinked_item',
          orderItemId: orderItem.id,
          productId: selectedProduct.id,
          customerConfirmed,
          customerConfirmationNote: confirmationNote.trim()
        })
      });
      const result = await response.json() as { error?: string; repair?: { success?: boolean } };
      if (!response.ok || !result.repair?.success) {
        throw new Error(result.error || 'Order item could not be repaired.');
      }
      onSaved();
    } catch (repairError) {
      setError(repairError instanceof Error ? repairError.message : 'Order item could not be repaired.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left">
      <div className="flex items-start gap-2 text-amber-950">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-black uppercase">Order line #{orderItem.id} is missing its product</p>
          <p className="mt-1 text-xs leading-relaxed">
            Quantity {orderItem.quantity}{orderItem.size ? ` · ${orderItem.size}` : ''} · saved checkout price KES {Number.isFinite(savedPrice) ? savedPrice.toLocaleString('en-KE') : 'unavailable'}.
            Confirm the intended item with the customer before making a correction.
          </p>
        </div>
      </div>
      <label className="block text-xs font-bold text-slate-700">
        Customer-confirmed catalog product
        <select
          value={productId}
          onChange={event => setProductId(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
          disabled={saving}
        >
          <option value="">Select the exact confirmed product</option>
          {products.map(product => (
            <option key={product.id} value={product.id}>
              {product.name} · current catalog price KES {Number(product.price).toLocaleString('en-KE')}
            </option>
          ))}
        </select>
      </label>
      {priceDiffers && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-950">
          The current catalog price differs from checkout. Repair preserves the original saved order price of KES {savedPrice.toLocaleString('en-KE')}; it will not silently reprice the customer.
        </p>
      )}
      <label className="block text-xs font-bold text-slate-700">
        Note confirming how the customer verified the item
        <Textarea
          value={confirmationNote}
          onChange={event => setConfirmationNote(event.target.value)}
          maxLength={500}
          placeholder="For example: Confirmed by phone before correcting the product link."
          className="mt-1 min-h-20 rounded-xl bg-white"
          disabled={saving}
        />
      </label>
      <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
        <input
          type="checkbox"
          checked={customerConfirmed}
          onChange={event => setCustomerConfirmed(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
          disabled={saving}
        />
        I confirmed this exact item with the customer; this correction will be recorded in the dispatch audit.
      </label>
      {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
      <Button
        type="button"
        onClick={() => void repairItem()}
        disabled={saving || !selectedProduct || !customerConfirmed || confirmationNote.trim().length < 8}
        className="h-10 rounded-xl"
      >
        {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Wrench size={15} className="mr-2" />}
        Confirm item and repair link
      </Button>
    </div>
  );
}
