'use client';

import * as React from 'react';
import Link from 'next/link';
import TacticalEventFeed from '@/components/admin/TacticalEventFeed';
import OrderItemsSummary from '@/components/admin/OrderItemsSummary';
import UnlinkedOrderItemRepair from '@/components/admin/UnlinkedOrderItemRepair';
import {
  Plus,
  RefreshCcw,
  Package,
  Phone,
  User,
  DollarSign,
  Tag,
  FileDown,
  MessageSquareShare,
  Table,
  Link2,
  Search,
  ShieldAlert,
  Navigation,
  History,
  Clock3,
  ChevronDown,
  CheckSquare,
  Square,
  Gift,
  Trash2
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatPrice, cn } from '@/lib/utils';
import { generateReceiptPDF, getWhatsAppReceiptLink } from '@/lib/receiptService';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';

import { OrderStatus as MachineStatus, getAvailableActions, isValidTransition } from '@/lib/ob-os/state-machine';

interface OrderItem {
    id: number;
    product_id: number | null;
    quantity: number;
    unit_price: number;
    unit_cost: number;
    size: string;
    serial_number?: string;
    imei?: string;
}

interface OrderRecord {
  id: number;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  total_price: number;
  status: MachineStatus;
  payment_method: string;
  note?: string | null;
  rider_name?: string | null;
  rider_phone?: string | null;
  captured_by?: string;
  order_items?: OrderItem[];
  warehouse_location?: string;
  is_gift?: boolean;
  gift_message?: string | null;
  gift_recipient?: string | null;
  gift_occasion?: string | null;
  status_events?: OrderStatusEvent[];
}

interface OrderStatusEvent {
  id: number;
  order_id: number;
  from_status: string | null;
  to_status: string;
  actor_type: string;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

interface ManualOrderForm {
  customer_name: string;
  customer_phone: string;
  product_id: string;
  quantity: string;
  total_price: string;
  status: MachineStatus;
  payment_method: PaymentMethod;
  note: string;
}

const paymentOptions = ['M-Pesa', 'COD', 'Paystack'] as const;

type PaymentMethod = (typeof paymentOptions)[number];
const serverManagedStatuses = new Set<MachineStatus>([
  'Paid', 'Payment Failed', 'Refunded', 'Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered'
]);
const bulkStatusCandidates: MachineStatus[] = [
  'Payment Pending', 'Stock Reserved', 'Supplier Confirmed', 'Processing', 'Packed',
  'Completed', 'Cancelled', 'Warranty', 'Returned'
];

function getAdminStatusActions(status: MachineStatus) {
  return getAvailableActions(status).filter(nextStatus => !serverManagedStatuses.has(nextStatus));
}

const initialManualOrder: ManualOrderForm = {
  customer_name: '',
  customer_phone: '',
  product_id: '',
  quantity: '1',
  total_price: '',
  status: 'Created',
  payment_method: 'M-Pesa',
  note: '',
};

export default function AdminOrdersPage() {
  const { role, email, permissions } = useAdmin();
  const [orders, setOrders] = React.useState<OrderRecord[]>([]);
  const [products, setProducts] = React.useState<{ id: number; name: string; price: number; cost_price: number; stock: number; variant_stock: Record<string, number>; status: string }[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [statusMessage, setStatusMessage] = React.useState<{
    type: 'idle' | 'success' | 'error';
    text: string;
  }>({ type: 'idle', text: '' });
  const [updatingId, setUpdatingId] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSavingManualOrder, setIsSavingManualOrder] = React.useState(false);
  const [manualOrder, setManualOrder] = React.useState<ManualOrderForm>(initialManualOrder);
  const [selectedOrders, setSelectedOrders] = React.useState<number[]>([]);
  const [selectedBulkStatus, setSelectedBulkStatus] = React.useState<MachineStatus | ''>('');
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [editingGiftOrderId, setEditingGiftOrderId] = React.useState<number | null>(null);
  const [giftMessageDraft, setGiftMessageDraft] = React.useState('');
  const [isSavingGiftMessage, setIsSavingGiftMessage] = React.useState(false);
  const [flowHistoryWarning, setFlowHistoryWarning] = React.useState<string | null>(null);
  const [expandedFlowOrderId, setExpandedFlowOrderId] = React.useState<number | null>(null);

  const canManageOrders = role === 'staff' || role === 'admin' || role === 'owner' || permissions.can_manage_orders;
  const canDeleteOrders = role === 'admin' || role === 'owner' || permissions.can_delete_items;
  const canSeeMoney = role === 'staff' || role === 'admin' || role === 'owner';

  const productOptions = React.useMemo(() => {
    return products.map((product) => ({
      id: product.id,
      name: product.name,
    }));
  }, [products]);

  const productNameMap = React.useMemo(() => {
    return new Map(products.map((product) => [product.id, product.name]));
  }, [products]);

  const loadOrders = React.useCallback(async (background = false) => {
    if (!background) setIsLoading(true);

    try {
      const response = await fetch('/api/admin/orders', { cache: 'no-store' });
      const result = await response.json() as {
        orders?: OrderRecord[];
        products?: { id: number; name: string; price: number; cost_price: number; stock: number; variant_stock: Record<string, number>; status: string }[];
        error?: string;
        flowHistoryWarning?: string | null;
      };
      if (!response.ok || !result.orders || !result.products) throw new Error(result.error || 'Unable to load orders.');
      setOrders(result.orders);
      setProducts(result.products);
      setFlowHistoryWarning(result.flowHistoryWarning || null);
      setStatusMessage({ type: 'idle', text: '' });
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Pipeline error:', error);
      setStatusMessage({ type: 'error', text: error.message || 'Unable to load orders.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const filteredOrders = React.useMemo(() => {
      return orders.filter(o =>
          (o.customer_name || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
          (o.customer_phone || '').includes(searchQuery) ||
          (o.id || '').toString().includes(searchQuery)
      );
  }, [orders, searchQuery]);

  React.useEffect(() => {
    void loadOrders();
    const timer = window.setInterval(() => void loadOrders(true), 15_000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

  const summary = React.useMemo(() => {
    const totalRevenue = orders
      .filter(o => o.status === 'Delivered' || o.status === 'Completed')
      .reduce((sum, order) => sum + Number(order.total_price || 0), 0);
    const pending = orders.filter((order) => ['Created', 'Pending', 'Payment Pending'].includes(order.status)).length;
    const delivered = orders.filter((order) => order.status === 'Delivered' || order.status === 'Completed').length;

    return {
      totalRevenue,
      pending,
      delivered,
    };
  }, [orders]);
  const availableBulkStatuses = React.useMemo(() => {
    const selected = orders.filter(order => selectedOrders.includes(order.id));
    if (!selected.length) return [];
    return bulkStatusCandidates.filter(status => selected.every(order =>
      getAdminStatusActions(order.status).includes(status)
    ));
  }, [orders, selectedOrders]);
  const effectiveBulkStatus = selectedBulkStatus && availableBulkStatuses.includes(selectedBulkStatus)
    ? selectedBulkStatus
    : availableBulkStatuses[0] || '';

  const renderOrderFlow = (order: OrderRecord) => {
    const events = order.status_events || [];
    const expanded = expandedFlowOrderId === order.id;
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setExpandedFlowOrderId(expanded ? null : order.id)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-primary hover:underline"
        >
          <History className="h-3 w-3" />
          Order flow ({events.length})
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && (
          <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-3">
            {events.length ? events.map(event => (
              <div key={event.id} className="flex gap-2 text-[10px]">
                <Clock3 className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="font-bold text-slate-700">
                    {event.from_status || 'Order received'} → {event.to_status}
                  </p>
                  <p className="mt-0.5 text-slate-500">
                    {new Date(event.created_at).toLocaleString()} · {event.actor_type}
                    {event.actor_id ? ` · ${event.actor_id}` : ''}
                    {event.reason ? ` · ${event.reason}` : ''}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-[10px] leading-relaxed text-slate-500">
                No timeline entries are recorded yet. Older events cannot be reconstructed; new events are captured after the order-flow migration is installed.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  const updateOrderStatus = async (orderId: number, status: MachineStatus) => {
    if (!canManageOrders) return;
    if (serverManagedStatuses.has(status)) {
      setStatusMessage({ type: 'error', text: `${status} is handled by payment verification or the protected dispatch/delivery workflow.` });
      return;
    }

    const orderToUpdate = orders.find(o => o.id === orderId);
    if (!orderToUpdate) return;

    // Online Bar OS: State Machine Enforcement
    if (!isValidTransition(orderToUpdate.status, status)) {
        setStatusMessage({
            type: 'error',
            text: `Protocol Violation: Cannot move from ${orderToUpdate.status} to ${status}.`
        });
        return;
    }

    setUpdatingId(orderId);
    setStatusMessage({ type: 'idle', text: '' });

    try {
      const oldStatus = orderToUpdate?.status;
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', id: orderId, status })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to update order status.');

      await logAuditAction(
        email,
        'UPDATE_ORDER_STATUS',
        { id: orderId, newStatus: status },
        { type: 'order', id: String(orderId) },
        { old: oldStatus ?? null, new: status }
      );

      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status } : order
        )
      );

      await loadOrders(true);
      setStatusMessage({
        type: 'success',
        text: `Order #${orderId} marked as ${status}.`,
      });
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Order update error:', error.message || error);
      setStatusMessage({
        type: 'error',
        text: error.message || 'Unable to update order status.',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDownloadReceipt = async (order: OrderRecord) => {
      const firstItem = order.order_items?.[0];
      const productName = firstItem
        ? firstItem.product_id === null ? 'Unlinked order item' : productNameMap.get(firstItem.product_id)
        : 'Multiple Beverages';
      const doc = await generateReceiptPDF({...order, product_name: productName} as Parameters<typeof generateReceiptPDF>[0]);
      doc.save(`Receipt_OnlineBar_${order.id}.pdf`);
  };

  const handleShareOnWhatsApp = (order: OrderRecord) => {
      const link = getWhatsAppReceiptLink(order as Parameters<typeof getWhatsAppReceiptLink>[0]);
      window.open(link, '_blank');
  };

  const handleSaveGiftMessage = async (order: OrderRecord) => {
      if (!canManageOrders) return;
      setIsSavingGiftMessage(true);
      try {
          const message = giftMessageDraft.trim();
          const response = await fetch('/api/admin/orders', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'gift', id: order.id, message })
          });
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || 'Unable to save gift card message.');

          await logAuditAction(email, 'UPDATE_GIFT_MESSAGE', { id: order.id });
          setOrders(current => current.map(item => item.id === order.id
              ? { ...item, is_gift: true, gift_message: message || null }
              : item));
          setEditingGiftOrderId(null);
          setGiftMessageDraft('');
          setStatusMessage({ type: 'success', text: `Gift card message saved for order #${order.id}.` });
      } catch (err: unknown) {
          const error = err as Error;
          setStatusMessage({ type: 'error', text: error.message || 'Unable to save gift card message.' });
      } finally {
          setIsSavingGiftMessage(false);
      }
  };

  const copyTrackingLink = (orderId: number) => {
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/track?id=${orderId}`;
      navigator.clipboard.writeText(link);
      setStatusMessage({ type: 'success', text: 'Tracking link copied to clipboard!' });
  };

  const copyRiderLink = (orderId: number) => {
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/dispatch/${orderId}`;
      navigator.clipboard.writeText(link);
      setStatusMessage({ type: 'success', text: 'Rider dispatch link copied!' });
  };

  const handleExportCSV = () => {
    const headers = ['Order ID', 'Date', 'Customer', 'Phone', 'Total', 'Status', 'Payment Method'];
    const rows = orders.map(o => [
        o.id,
        new Date(o.created_at).toLocaleDateString(),
        o.customer_name,
        o.customer_phone,
        o.total_price,
        o.status,
        o.payment_method
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
        + headers.join(",") + "\n"
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `OnlineBar_Orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleManualOrderSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageOrders) return;

    if (!manualOrder.customer_name.trim() || !manualOrder.customer_phone.trim()) {
      setStatusMessage({ type: 'error', text: 'Name and phone required.' });
      return;
    }

    const quantity = Number(manualOrder.quantity);
    const totalPrice = Number(manualOrder.total_price);

    if (isNaN(quantity) || quantity <= 0 || isNaN(totalPrice) || totalPrice < 0) {
      setStatusMessage({ type: 'error', text: 'Enter valid numeric values.' });
      return;
    }

    setIsSavingManualOrder(true);
    const targetProductId = manualOrder.product_id ? Number(manualOrder.product_id) : null;

    const orderData = {
        customer_name: manualOrder.customer_name.trim(),
        customer_phone: manualOrder.customer_phone.trim(),
        quantity,
        total_price: totalPrice,
        status: manualOrder.status,
        payment_method: manualOrder.payment_method,
        note: manualOrder.note.trim() || null,
        product_id: targetProductId,
        captured_by: email || 'system'
    };

    try {
      const response = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to save order.');
      await logAuditAction(email || 'system', 'CREATE_MANUAL_ORDER', { customer: manualOrder.customer_name, total: totalPrice });
      await loadOrders();
      setManualOrder(initialManualOrder);
      setStatusMessage({ type: 'success', text: 'Manual order saved.' });
    } catch (error) {
      setStatusMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save order.' });
    } finally {
      setIsSavingManualOrder(false);
    }
  };

  const toggleOrderSelection = (id: number) => {
      setSelectedOrders(prev =>
          prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
  };

  const handleBulkStatusUpdate = async (status: MachineStatus) => {
      if (selectedOrders.length === 0) return;
      setIsBulkUpdating(true);
      try {
          const response = await fetch('/api/admin/orders', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'bulk_status', ids: selectedOrders, status })
          });
          const result = await response.json() as { error?: string; updated?: number };
          if (!response.ok) throw new Error(result.error || 'Selected orders could not be updated.');

          await logAuditAction(email, 'BULK_UPDATE_ORDERS', { count: selectedOrders.length, newStatus: status });

          await loadOrders(true);
          setSelectedOrders([]);
          setStatusMessage({ type: 'success', text: `Successfully updated ${result.updated ?? selectedOrders.length} orders.` });
      } catch (err: unknown) {
          const error = err as Error;
          setStatusMessage({ type: 'error', text: error.message });
      } finally {
          setIsBulkUpdating(false);
      }
  };

  const handleDeleteOrder = async (id: number) => {
      if (!canDeleteOrders) return;
      if (!window.confirm(`Nuclear Option: Expunge Order #${id} from the records?`)) return;

      try {
          const response = await fetch(`/api/admin/orders?id=${id}`, { method: 'DELETE' });
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || 'Order could not be deleted.');

          await logAuditAction(email, 'DELETE_ORDER', { id });
          setOrders(prev => prev.filter(o => o.id !== id));
          setStatusMessage({ type: 'success', text: `Order #${id} expunged.` });
      } catch (err: unknown) {
          const error = err as Error;
          setStatusMessage({ type: 'error', text: error.message });
      }
  };

  if (!canManageOrders) {
      return (
          <div className="p-24 flex flex-col items-center justify-center text-center">
              <ShieldAlert className="h-16 w-16 text-primary mb-6" />
              <h2 className="text-2xl font-black uppercase text-foreground">Access Denied</h2>
              <p className="text-slate-500 mt-2">You don&apos;t have permission to manage orders.</p>
          </div>
      );
  }

  return (
    <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
        <div>
          <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter">Order fulfillment</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage beverage dispatch and generate customer receipts.</p>
        </div>
        <div className="flex gap-2">
            <Button onClick={handleExportCSV} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest transition-all">
                <Table className="h-4 w-4 mr-2" /> Export CSV
            </Button>
            <Button onClick={() => loadOrders()} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest transition-all">
                <RefreshCcw className="h-4 w-4 mr-2" /> Sync Data
            </Button>
        </div>
      </header>

      {flowHistoryWarning && (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {flowHistoryWarning}
        </div>
      )}

      <div className="relative">
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone or order ID..."
            className="h-14 rounded-2xl border-slate-100 bg-white pl-12 text-sm font-medium shadow-sm"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
        <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex items-center gap-6 text-left group hover:shadow-xl transition-all">
          <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-1">Net Revenue</p>
            <h3 className="text-2xl font-black text-foreground uppercase tracking-tighter">
                {canSeeMoney ? formatPrice(summary.totalRevenue) : 'HIDDEN'}
            </h3>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex items-center gap-6 text-left group hover:shadow-xl transition-all">
          <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <Tag className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-1">Pending Orders</p>
            <h3 className="text-2xl font-black text-foreground uppercase tracking-tighter">{summary.pending}</h3>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex items-center gap-6 text-left group hover:shadow-xl transition-all">
          <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-1">Delivered Bottles</p>
            <h3 className="text-2xl font-black text-foreground uppercase tracking-tighter">{summary.delivered}</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm sticky top-8">
            <h2 className="text-lg font-black text-foreground mb-8 flex items-center gap-2 uppercase tracking-tighter">
              <Plus className="h-5 w-5 text-primary" /> Log Manual Order
            </h2>
            <form onSubmit={handleManualOrderSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Customer Details</label>
                <Input
                  value={manualOrder.customer_name}
                  onChange={(e) => setManualOrder({...manualOrder, customer_name: e.target.value})}
                  placeholder="Full Name"
                  className="rounded-2xl border-slate-100 bg-slate-50/50 h-12"
                />
                <Input
                  value={manualOrder.customer_phone}
                  onChange={(e) => setManualOrder({...manualOrder, customer_phone: e.target.value})}
                  placeholder="07XXXXXXXX"
                  className="rounded-2xl border-slate-100 bg-slate-50/50 h-12 mt-2"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Product</label>
                <select
                  className="w-full h-12 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 text-sm font-bold uppercase tracking-widest outline-none"
                  value={manualOrder.product_id}
                  onChange={(e) => setManualOrder({...manualOrder, product_id: e.target.value})}
                >
                  <option value="">Manual Entry</option>
                  {productOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Qty</label>
                  <Input
                    type="number"
                    value={manualOrder.quantity}
                    onChange={(e) => setManualOrder({...manualOrder, quantity: e.target.value})}
                    className="rounded-2xl border-slate-100 bg-slate-50/50 h-12"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Total Ksh</label>
                  <Input
                    type="number"
                    value={manualOrder.total_price}
                    onChange={(e) => setManualOrder({...manualOrder, total_price: e.target.value})}
                    placeholder="KES"
                    className="rounded-2xl border-slate-100 bg-slate-50/50 h-12"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Status & Method</label>
                <div className="grid grid-cols-2 gap-2">
                   <select
                    className="rounded-2xl border border-slate-100 bg-slate-50/50 h-12 px-3 text-xs font-black uppercase tracking-widest outline-none"
                    value={manualOrder.payment_method}
                    onChange={(e) => setManualOrder({...manualOrder, payment_method: e.target.value as PaymentMethod})}
                  >
                    {paymentOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select
                    className="rounded-2xl border border-slate-100 bg-slate-50/50 h-12 px-3 text-xs font-black uppercase tracking-widest outline-none"
                    value="Created"
                    disabled
                    aria-label="Initial order status"
                  >
                    <option value="Created">Created</option>
                  </select>
                </div>
              </div>

              <Button type="submit" disabled={isSavingManualOrder} className="w-full h-16 rounded-[1.5rem] bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-2xl shadow-primary/20 mt-4 hover:bg-primary/90 transition-all active:scale-95">
                {isSavingManualOrder ? 'Processing...' : 'Create Order'}
              </Button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6 text-left">
          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden text-left flex flex-col min-h-[600px]">
            {selectedOrders.length > 0 && (
                <div className="z-30 flex shrink-0 flex-col gap-3 border-b border-slate-100 bg-slate-50/90 p-4 animate-in slide-in-from-top-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-primary"></div>
                        <p className="text-xs font-bold text-slate-700">{selectedOrders.length} orders selected</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        {availableBulkStatuses.length > 0 ? (
                            <>
                                <select
                                    aria-label="Bulk order status"
                                    value={effectiveBulkStatus}
                                    onChange={event => setSelectedBulkStatus(event.target.value as MachineStatus)}
                                    className="h-10 min-w-40 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                    {availableBulkStatuses.map(status => <option key={status} value={status}>{status}</option>)}
                                </select>
                                <Button
                                    size="sm"
                                    disabled={isBulkUpdating || !effectiveBulkStatus}
                                    onClick={() => effectiveBulkStatus && handleBulkStatusUpdate(effectiveBulkStatus)}
                                    className="h-10 rounded-lg px-4 text-xs font-bold"
                                >
                                    {isBulkUpdating ? 'Updating…' : 'Apply status'}
                                </Button>
                            </>
                        ) : (
                            <p className="text-xs text-slate-500">No shared next status is available for this selection.</p>
                        )}
                        <Button
                            onClick={() => setSelectedOrders([])}
                            variant="ghost"
                            className="h-10 px-3 text-xs font-semibold text-slate-500 hover:text-rose-600"
                        >
                            Clear selection
                        </Button>
                    </div>
                </div>
            )}

            {isLoading ? (
              <div className="p-24 flex flex-col items-center gap-4 flex-1">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Checking Log...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-medium italic flex-1">No matching orders found.</div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <div className="hidden lg:block overflow-x-auto no-scrollbar">
                    <table className="w-full min-w-[920px] text-left text-sm border-separate border-spacing-y-2">
                    <thead>
                        <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[9px] tracking-[0.2em] whitespace-nowrap border-none">
                        <th className="px-4 py-4 w-12 text-center rounded-l-2xl">
                            <button onClick={() => {
                                if (selectedOrders.length === filteredOrders.length) {
                                    setSelectedOrders([]);
                                } else {
                                    setSelectedOrders(filteredOrders.map(o => o.id));
                                }
                            }}>
                                {selectedOrders.length === filteredOrders.length && filteredOrders.length > 0 ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-slate-200" />}
                            </button>
                        </th>
                        <th className="px-5 py-4 min-w-[190px]">Customer Identity</th>
                        <th className="px-5 py-4 min-w-[240px]">Beverage Details</th>
                        <th className="px-5 py-4 w-32">Authorized By</th>
                        {canSeeMoney && <th className="px-5 py-4 w-32">Order Margin</th>}
                        <th className="px-5 py-4 w-44">Dispatch State</th>
                        <th className="px-5 py-4 text-right rounded-r-2xl">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y-0">
                        {filteredOrders.map((order) => {
                            const totalCost = order.order_items?.reduce((sum, item) => sum + (item.unit_cost * item.quantity), 0) || 0;
                            const profit = Number(order.total_price) - Number(totalCost);
                            const isSelected = selectedOrders.includes(order.id);

                            return (
                            <tr key={order.id} className={cn(
                                "bg-white border border-slate-100 transition-all group text-left relative align-top hover:shadow-md hover:border-primary/20",
                                isSelected && "bg-primary/5 border-primary/20"
                            )}>
                                <td className="px-4 py-5 align-top text-center rounded-l-[1.5rem]">
                                    <button onClick={() => toggleOrderSelection(order.id)}>
                                        {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-slate-200" />}
                                    </button>
                                </td>
                                <td className="px-5 py-5 align-top">
                                <div className="flex flex-col text-left">
                                    <span className="font-black text-foreground flex items-center gap-2 uppercase text-xs tracking-tight whitespace-nowrap">
                                    <User className="h-3 w-3 text-slate-300" /> {order.customer_name}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-2 mt-1.5 whitespace-nowrap">
                                    <Phone className="h-3 w-3" /> {order.customer_phone}
                                    </span>
                                    {renderOrderFlow(order)}

                                    {(order.is_gift || order.gift_message || order.note?.includes('GIFT')) && (
                                        <div className="mt-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-[10px] space-y-2 max-w-[220px]">
                                            <div className="flex items-center gap-1.5 font-black uppercase text-amber-800 text-[9px] tracking-widest">
                                                <Gift className="h-3 w-3" /> GIFT PACKAGE
                                            </div>
                                            {(order.gift_recipient || order.gift_occasion) && (
                                                <p className="text-amber-800 font-bold">
                                                    {[order.gift_recipient, order.gift_occasion].filter(Boolean).join(' · ')}
                                                </p>
                                            )}
                                            {editingGiftOrderId === order.id ? (
                                                <div className="space-y-2">
                                                    <Textarea
                                                        value={giftMessageDraft}
                                                        onChange={event => setGiftMessageDraft(event.target.value)}
                                                        placeholder="Write the message for the gift card..."
                                                        maxLength={500}
                                                        className="min-h-20 rounded-xl border-amber-200 bg-white p-3 text-xs text-slate-900"
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            disabled={isSavingGiftMessage}
                                                            onClick={() => handleSaveGiftMessage(order)}
                                                            className="h-8 rounded-lg bg-amber-600 px-3 text-[9px] font-black uppercase text-white hover:bg-amber-700"
                                                        >
                                                            {isSavingGiftMessage ? 'Saving...' : 'Save Message'}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={isSavingGiftMessage}
                                                            onClick={() => {
                                                                setEditingGiftOrderId(null);
                                                                setGiftMessageDraft('');
                                                            }}
                                                            className="h-8 rounded-lg border-amber-200 px-3 text-[9px] font-black uppercase"
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {order.gift_message ? (
                                                        <p className="font-bold italic leading-snug break-words">&quot;{order.gift_message}&quot;</p>
                                                    ) : (
                                                        <p className="text-amber-700 italic">No gift card message yet.</p>
                                                    )}
                                                    {canManageOrders && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingGiftOrderId(order.id);
                                                                setGiftMessageDraft(order.gift_message || '');
                                                            }}
                                                            className="font-black uppercase tracking-wider text-amber-800 underline underline-offset-2"
                                                        >
                                                            {order.gift_message ? 'Edit card message' : 'Write card message'}
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                                </td>
                                <td className="px-5 py-5 align-top">
                                <OrderItemsSummary items={order.order_items} productNameMap={productNameMap} warehouseLocation={order.warehouse_location} />
                                {order.order_items?.filter(item => item.product_id === null).map(item => (
                                    <UnlinkedOrderItemRepair
                                        key={item.id}
                                        orderItem={item}
                                        products={products.filter(product => product.status === 'Live')}
                                        onSaved={() => {
                                            setStatusMessage({ type: 'success', text: `Order #${order.id} item link repaired. Retry merchant allocation on Dispatch after confirming available stock.` });
                                            void loadOrders(true);
                                        }}
                                    />
                                ))}
                                </td>
                                <td className="px-5 py-5 align-top">
                                    <span className={cn(
                                        "px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border shadow-sm",
                                        (order as unknown as Record<string, unknown>).captured_by === 'system' ? "bg-slate-50 text-slate-400 border-slate-100" : "bg-primary/5 text-primary border-primary/10"
                                    )}>
                                        {(order as unknown as Record<string, unknown>).captured_by?.toString().split('@')[0] || 'System'}
                                    </span>
                                </td>
                                {canSeeMoney && (
                                    <td className="px-5 py-5 align-top font-black text-primary text-sm whitespace-nowrap">
                                        {formatPrice(profit)}
                                    </td>
                                )}
                                <td className="px-5 py-5 align-top text-left">
                                <div className="flex flex-col gap-2.5">
                                    <select
                                        className={cn(
                                            "rounded-xl border-none px-4 py-2 text-[9px] font-black uppercase tracking-widest outline-none ring-0 transition-all cursor-pointer shadow-sm",
                                            order.status === 'Cancelled' || order.status === 'Payment Failed' ? "bg-rose-50 text-rose-600" : "text-primary bg-primary/5 hover:bg-primary/10"
                                        )}
                                        value={order.status}
                                        onChange={(e) => updateOrderStatus(order.id, e.target.value as MachineStatus)}
                                        disabled={updatingId === order.id}
                                    >
                                        <option value={order.status}>{order.status}</option>
                                        {getAdminStatusActions(order.status).map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>

                                    {order.status !== 'Delivered' && order.status !== 'Cancelled' && (
                                        <Link
                                            href={`/lord/dispatch?orderId=${order.id}#assignment-queue`}
                                            className="text-[8px] font-black uppercase text-primary hover:underline text-left pl-1 whitespace-nowrap"
                                        >
                                            {order.rider_name ? `Rider: ${order.rider_name}` : 'Assign Rider'}
                                        </Link>
                                    )}
                                </div>
                                </td>
                                <td className="px-5 py-5 align-top text-right rounded-r-[1.5rem]">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 rounded-xl hover:bg-white hover:shadow-xl text-slate-400 hover:text-primary transition-all active:scale-95"
                                            onClick={() => handleDownloadReceipt(order)}
                                            title="Download PDF Receipt"
                                        >
                                            <FileDown className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 rounded-xl hover:bg-primary/5 hover:shadow-xl text-slate-400 hover:text-primary transition-all active:scale-95"
                                            onClick={() => handleShareOnWhatsApp(order)}
                                            title="Share Receipt on WhatsApp"
                                        >
                                            <MessageSquareShare className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 rounded-xl hover:bg-primary/5 hover:shadow-xl text-slate-400 hover:text-primary transition-all active:scale-95"
                                            onClick={() => copyTrackingLink(order.id)}
                                            title="Copy Tracking Link"
                                        >
                                            <Link2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 rounded-xl hover:bg-primary/5 hover:shadow-xl text-slate-400 hover:text-primary transition-all active:scale-95"
                                            onClick={() => copyRiderLink(order.id)}
                                            title="Copy Runner Dispatch Link"
                                        >
                                            <Navigation className="h-4 w-4" />
                                        </Button>
                                        {canDeleteOrders && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all active:scale-95"
                                                onClick={() => handleDeleteOrder(order.id)}
                                                title="Expunge Order"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                    </table>
                </div>

                <div className="lg:hidden divide-y divide-slate-100">
                    {filteredOrders.map((order) => {
                        const isSelected = selectedOrders.includes(order.id);
                        return (
                            <div key={order.id} className={cn(
                                "p-6 space-y-4 transition-all",
                                isSelected ? "bg-primary/5" : "bg-white"
                            )}>
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => toggleOrderSelection(order.id)}>
                                            {isSelected ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5 text-slate-200" />}
                                        </button>
                                        <div>
                                            <p className="font-black text-foreground uppercase text-xs">#{order.id} â€” {order.customer_name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{order.customer_phone}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-foreground text-sm">{formatPrice(order.total_price)}</p>
                                        <p className="text-[8px] font-black text-primary uppercase mt-1 tracking-widest">{order.payment_method}</p>
                                    </div>
                                </div>
                                {renderOrderFlow(order)}

                                <OrderItemsSummary items={order.order_items} productNameMap={productNameMap} warehouseLocation={order.warehouse_location} />
                                {order.order_items?.filter(item => item.product_id === null).map(item => (
                                    <UnlinkedOrderItemRepair
                                        key={item.id}
                                        orderItem={item}
                                        products={products.filter(product => product.status === 'Live')}
                                        onSaved={() => {
                                            setStatusMessage({ type: 'success', text: `Order #${order.id} item link repaired. Retry merchant allocation on Dispatch after confirming available stock.` });
                                            void loadOrders(true);
                                        }}
                                    />
                                ))}

                                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
                                    <span className="text-[9px] font-black uppercase text-slate-400">Pipeline Status</span>
                                    <select
                                        className="h-8 rounded-lg border-none text-[9px] font-black uppercase tracking-widest px-3 outline-none ring-0 text-primary bg-primary/10"
                                        value={order.status}
                                        onChange={(e) => updateOrderStatus(order.id, e.target.value as MachineStatus)}
                                    >
                                        <option value={order.status}>{order.status}</option>
                                        {getAdminStatusActions(order.status).map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>

                                <div className="flex gap-2">
                                    <Button onClick={() => handleDownloadReceipt(order)} variant="outline" className="flex-1 h-10 rounded-xl text-[8px] font-black uppercase border-slate-100">Receipt</Button>
                                    <Button onClick={() => copyTrackingLink(order.id)} variant="outline" className="flex-1 h-10 rounded-xl text-[8px] font-black uppercase border-slate-100">Track</Button>
                                    <Button asChild variant="outline" className="flex-1 h-10 rounded-xl text-[8px] font-black uppercase border-slate-100">
                                      <Link href="/lord/dispatch">Dispatch</Link>
                                    </Button>
                                    <Button onClick={() => handleShareOnWhatsApp(order)} className="flex-1 h-10 rounded-xl bg-primary text-white text-[8px] font-black uppercase shadow-lg">WhatsApp</Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {statusMessage.text && (
        <div className="fixed bottom-8 right-8 p-6 rounded-[2rem] shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-500 font-black uppercase text-[10px] tracking-widest z-[100] bg-primary text-white shadow-primary/20">
          {statusMessage.text}
        </div>
      )}

      <div className="pt-8">
          <TacticalEventFeed
              title="Dispatch Queue Operations Stream"
              subtitle="Live Real-time Dispatch Orders & Runner Status Ticker"
          />
      </div>
    </div>
  );
}
