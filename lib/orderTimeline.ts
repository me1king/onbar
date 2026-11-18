export type OrderTimelineSource = {
  to_status: unknown;
  created_at: unknown;
};

export type PublicOrderTimelineEvent = {
  status: string;
  createdAt: string;
};

export function normalizeOrderTimeline(
  events: OrderTimelineSource[],
  limit = 30
): PublicOrderTimelineEvent[] {
  const eventLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 30;
  if (!eventLimit) return [];

  return events.flatMap((event, index) => {
    if (typeof event.to_status !== 'string' || typeof event.created_at !== 'string') return [];
    const status = event.to_status.trim();
    const timestamp = Date.parse(event.created_at);
    if (!status || status.length > 80 || !Number.isFinite(timestamp)) return [];
    return [{ status, createdAt: new Date(timestamp).toISOString(), timestamp, index }];
  })
    .sort((left, right) => left.timestamp - right.timestamp || left.index - right.index)
    .slice(-eventLimit)
    .map(({ status, createdAt }) => ({ status, createdAt }));
}
