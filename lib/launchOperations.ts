export type IssueType = 'wrong-item' | 'late' | 'warm-beer' | 'missing-rider' | 'refund-request';
export type Severity = 'low' | 'medium' | 'high';

export interface LaunchOrderProfit {
  orderId: string;
  customer: string;
  item: string;
  productMargin: number;
  deliveryFee: number;
  serviceFee: number;
  riderPay: number;
  paymentFees: number;
  promoCost: number;
  refund: number;
  supportCost: number;
  netProfit: number;
  status: 'profitable' | 'warning' | 'loss';
}

export interface LaunchIssue {
  id: string;
  orderId: string;
  type: IssueType;
  severity: Severity;
  customer: string;
  recommendedAction: 'credit' | 'refund' | 'manual-review' | 'merchant-call';
  autoAmount: number;
  note: string;
}

export interface LaunchOpsSummary {
  totalNetProfit: number;
  breakEvenOrdersPerDay: number;
  refundExposure: number;
  activeSupportIssues: number;
  orders: LaunchOrderProfit[];
  issues: LaunchIssue[];
}

const defaultOrders: LaunchOrderProfit[] = [
  {
    orderId: 'ONB-4021',
    customer: 'Grace M',
    item: 'Tusker 6-pack',
    productMargin: 780,
    deliveryFee: 250,
    serviceFee: 180,
    riderPay: 420,
    paymentFees: 95,
    promoCost: 0,
    refund: 0,
    supportCost: 0,
    netProfit: 335,
    status: 'profitable',
  },
  {
    orderId: 'ONB-4018',
    customer: 'Martin K',
    item: 'Vodka + soda bundle',
    productMargin: 640,
    deliveryFee: 260,
    serviceFee: 175,
    riderPay: 440,
    paymentFees: 88,
    promoCost: 120,
    refund: 0,
    supportCost: 90,
    netProfit: -33,
    status: 'loss',
  },
  {
    orderId: 'ONB-4007',
    customer: 'Aisha N',
    item: 'Coke + mixer pack',
    productMargin: 390,
    deliveryFee: 220,
    serviceFee: 145,
    riderPay: 360,
    paymentFees: 70,
    promoCost: 0,
    refund: 120,
    supportCost: 75,
    netProfit: -80,
    status: 'loss',
  },
  {
    orderId: 'ONB-3996',
    customer: 'Tom O',
    item: 'Champagne setup',
    productMargin: 910,
    deliveryFee: 270,
    serviceFee: 180,
    riderPay: 430,
    paymentFees: 110,
    promoCost: 0,
    refund: 0,
    supportCost: 60,
    netProfit: 400,
    status: 'profitable',
  },
];

export function getLaunchOperationsSummary(): LaunchOpsSummary {
  const orders: LaunchOrderProfit[] = defaultOrders.map((order) => {
    const computedNetProfit =
      order.productMargin +
      order.deliveryFee +
      order.serviceFee -
      order.riderPay -
      order.paymentFees -
      order.promoCost -
      order.refund -
      order.supportCost;

    const status: LaunchOrderProfit['status'] =
      computedNetProfit > 150 ? 'profitable' : computedNetProfit > 0 ? 'warning' : 'loss';

    return {
      ...order,
      netProfit: computedNetProfit,
      status,
    };
  });

  const totalNetProfit = orders.reduce((sum, order) => sum + order.netProfit, 0);
  const refundExposure = orders.reduce((sum, order) => sum + order.refund, 0);
  const activeSupportIssues = 4;
  const breakEvenOrdersPerDay = Math.max(18, Math.ceil((71000 / 2600) * 1.2));

  return {
    totalNetProfit,
    breakEvenOrdersPerDay,
    refundExposure,
    activeSupportIssues,
    orders,
    issues: [
      {
        id: 'ISS-184',
        orderId: 'ONB-4007',
        type: 'warm-beer',
        severity: 'high',
        customer: 'Aisha N',
        recommendedAction: 'credit',
        autoAmount: 150,
        note: 'Temperature issue reported at delivery receiving; customer declined replacement.',
      },
      {
        id: 'ISS-183',
        orderId: 'ONB-4018',
        type: 'late',
        severity: 'medium',
        customer: 'Martin K',
        recommendedAction: 'credit',
        autoAmount: 120,
        note: 'Delivery was 27 minutes late and customer requested a partial credit.',
      },
      {
        id: 'ISS-182',
        orderId: 'ONB-4021',
        type: 'wrong-item',
        severity: 'medium',
        customer: 'Grace M',
        recommendedAction: 'merchant-call',
        autoAmount: 0,
        note: 'Wrong beverage variant delivered. Merchant needs stock and packing verification.',
      },
      {
        id: 'ISS-181',
        orderId: 'ONB-3996',
        type: 'missing-rider',
        severity: 'low',
        customer: 'Tom O',
        recommendedAction: 'manual-review',
        autoAmount: 0,
        note: 'No rider check-in recorded for final handoff; verify with dispatch logs.',
      },
    ],
  };
}
