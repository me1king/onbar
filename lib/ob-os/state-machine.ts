export type OrderStatus =
    | 'Created'
    | 'Pending'
    | 'Payment Pending'
    | 'Confirmed'
    | 'Paid'
    | 'Stock Reserved'
    | 'Supplier Confirmed'
    | 'Processing'
    | 'Packed'
    | 'Dispatched'
    | 'Picked Up'
    | 'Out for Delivery'
    | 'Delivered'
    | 'Completed'
    | 'Cancelled'
    | 'Payment Failed'
    | 'Refunded'
    | 'Warranty'
    | 'Returned';

/**
 * Online Bar State Machine Protocol
 * Defines valid transitions for orders.
 */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    'Created': ['Payment Pending', 'Cancelled'],
    'Pending': ['Paid', 'Payment Failed', 'Cancelled'],
    'Payment Pending': ['Paid', 'Payment Failed', 'Cancelled'],
    'Confirmed': ['Processing', 'Cancelled'],
    'Paid': ['Stock Reserved', 'Dispatched', 'Cancelled', 'Refunded'],
    'Stock Reserved': ['Supplier Confirmed', 'Processing', 'Cancelled', 'Refunded'],
    'Supplier Confirmed': ['Processing', 'Cancelled', 'Refunded'],
    'Processing': ['Packed', 'Cancelled', 'Refunded'],
    'Packed': ['Dispatched', 'Cancelled', 'Refunded'],
    'Dispatched': ['Picked Up', 'Out for Delivery', 'Delivered', 'Cancelled', 'Refunded'],
    'Picked Up': ['Out for Delivery', 'Delivered', 'Returned'],
    'Out for Delivery': ['Delivered', 'Returned', 'Cancelled'],
    'Delivered': ['Completed', 'Warranty', 'Returned'],
    'Completed': ['Warranty', 'Returned'],

    // Termination/Special States
    'Cancelled': [],
    'Payment Failed': ['Payment Pending', 'Cancelled'],
    'Refunded': [],
    'Warranty': ['Processing', 'Completed'],
    'Returned': ['Refunded', 'Stock Reserved']
};

export function isValidTransition(current: OrderStatus, next: OrderStatus): boolean {
    const allowed = VALID_TRANSITIONS[current] || [];
    return allowed.includes(next);
}

export function getAvailableActions(current: OrderStatus): OrderStatus[] {
    return VALID_TRANSITIONS[current] || [];
}
