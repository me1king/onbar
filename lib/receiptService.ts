import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatPrice, getPublicBaseUrl } from './utils';

interface Order {
    id: string | number;
    customer_name: string;
    customer_phone: string;
    created_at: string;
    payment_method: string;
    product_id?: string | number;
    product_name?: string;
    quantity?: number;
    total_price: number;
    status: string;
    order_items?: Array<{
        product_id: number | null;
        quantity: number;
        unit_price: number;
        size?: string;
        product_name?: string;
    }>;
}

/**
 * Generates a professional PDF receipt for an order
 */
export async function generateReceiptPDF(order: Order) {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(255, 107, 0); // Primary color
    doc.text('ONLINE BAR NAIROBI', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Premium Wine, Spirits & Late Night Snacks', 14, 26);
    doc.text('Nairobi, Kenya | support@onlinebar.co.ke', 14, 31);

    // Receipt Info
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`RECEIPT: #${order.id}`, 140, 20);
    doc.setFontSize(10);
    doc.text(`Date: ${new Date(order.created_at).toLocaleDateString()}`, 140, 26);
    doc.text(`Payment: ${order.payment_method}`, 140, 31);
    doc.text(`Status: ${order.status}`, 140, 36);

    // Customer Info
    doc.line(14, 44, 196, 44);
    doc.setFontSize(10);
    doc.text('BILL TO:', 14, 53);
    doc.setFontSize(12);
    doc.text(order.customer_name, 14, 59);
    doc.setFontSize(10);
    doc.text(order.customer_phone, 14, 64);

    // Table
    const items = order.order_items?.length
        ? order.order_items
        : [{
            product_id: Number(order.product_id) || 0,
            product_name: order.product_name || 'Online Bar Order',
            quantity: order.quantity || 1,
            unit_price: order.total_price / (order.quantity || 1),
            size: ''
        }];
    const tableRows = items.map(item => [
        `#${item.product_id || 'N/A'}`,
        `${item.product_name || 'Beverage Purchase'}${item.size ? ` (${item.size})` : ''}`,
        String(item.quantity),
        formatPrice(item.unit_price),
        formatPrice(item.unit_price * item.quantity)
    ]);

    autoTable(doc, {
        startY: 78,
        head: [['Item ID', 'Description', 'Qty', 'Unit Price', 'Total']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255] },
        styles: { fontSize: 10, cellPadding: 5 }
    });

    // Summary
    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 75;
    doc.setFontSize(12);
    doc.text('TOTAL:', 140, finalY + 10);
    doc.setFontSize(16);
    doc.text(formatPrice(order.total_price), 160, finalY + 10);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Thank you for choosing Online Bar. Genuine products and chilled dispatch guaranteed.', 14, finalY + 30);
    doc.text('This is an automatically generated receipt.', 14, finalY + 35);

    return doc;
}

/**
 * Creates a WhatsApp share link for a receipt
 */
export function getWhatsAppReceiptLink(order: Order) {
    const baseUrl = getPublicBaseUrl();
    const message = `Hello ${order.customer_name}! Thank you for shopping at *Online Bar*.\n\n*Order ID:* #${order.id}\n*Total:* ${formatPrice(order.total_price)}\n*Status:* ${order.status}\n\nYour order is ready. View tracking here: ${baseUrl}/track?id=${order.id}`;
    return `https://wa.me/${order.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
