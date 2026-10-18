export const CUSTOMER_NOTIFICATION_STATUSES = ['Paid', 'Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered'] as const;
export type CustomerNotificationStatus = typeof CUSTOMER_NOTIFICATION_STATUSES[number];

export const CUSTOMER_NOTIFICATION_CHANNELS = ['email', 'whatsapp', 'sms'] as const;
export type CustomerNotificationChannel = typeof CUSTOMER_NOTIFICATION_CHANNELS[number];

export function normalizeCustomerContactKey(email: string, phone: string): string | null {
  if (email.trim()) return `email:${email.trim().toLowerCase()}`;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `254${digits.slice(1)}`;
  return digits ? `phone:${digits}` : null;
}

export interface CustomerNotificationRule {
  enabled: boolean;
  channels: CustomerNotificationChannel[];
  subject: string;
  message: string;
}

export type CustomerNotificationConfig = Record<CustomerNotificationStatus, CustomerNotificationRule>;

export const DEFAULT_CUSTOMER_NOTIFICATION_CONFIG: CustomerNotificationConfig = {
  Paid: {
    enabled: true,
    channels: ['email'],
    subject: 'Payment confirmed for order #{orderId}',
    message: 'Hi {name}, we have received your payment for order #{orderId}. Your order is being prepared and will be dispatched soon.'
  },
  Dispatched: {
    enabled: true,
    channels: ['email'],
    subject: 'Your order #{orderId} is on the way',
    message: 'Hi {name}, your order #{orderId} has been dispatched and is on the way. Track your order: {trackingUrl}'
  },
  'Picked Up': {
    enabled: true,
    channels: ['email'],
    subject: 'Your order #{orderId} has been collected',
    message: 'Hi {name}, your order #{orderId} has been collected from the shop and is being prepared for delivery. Track your order: {trackingUrl}'
  },
  'Out for Delivery': {
    enabled: true,
    channels: ['email'],
    subject: 'Your order #{orderId} is out for delivery',
    message: 'Hi {name}, your order #{orderId} is on its way to you now. Track its progress here: {trackingUrl}'
  },
  Delivered: {
    enabled: true,
    channels: ['email'],
    subject: 'Your order #{orderId} has been delivered',
    message: 'Hi {name}, order #{orderId} has been delivered. We hope you enjoy your order!'
  }
};

export function normalizeCustomerNotificationConfig(value: unknown): CustomerNotificationConfig {
  const config = { ...DEFAULT_CUSTOMER_NOTIFICATION_CONFIG };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return config;

  const supplied = value as Partial<Record<CustomerNotificationStatus, Partial<CustomerNotificationRule>>>;
  for (const status of CUSTOMER_NOTIFICATION_STATUSES) {
    const rule = supplied[status];
    if (!rule || typeof rule !== 'object') continue;
    config[status] = {
      enabled: typeof rule.enabled === 'boolean' ? rule.enabled : config[status].enabled,
      channels: Array.isArray(rule.channels)
        ? CUSTOMER_NOTIFICATION_CHANNELS.filter(channel => rule.channels?.includes(channel))
        : config[status].channels,
      subject: typeof rule.subject === 'string' ? rule.subject : config[status].subject,
      message: typeof rule.message === 'string' ? rule.message : config[status].message
    };
  }
  return config;
}
