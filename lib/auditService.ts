/**
 * Sends staff activity to the authenticated server endpoint, which derives
 * actor and request metadata from the verified session and HTTP request.
 */
export async function logAuditAction(
    _email: string,
    action: string,
    details: Record<string, unknown>,
    resource?: { type: string, id: string },
    diff?: { old: unknown, new: unknown }
) {
  try {
    const response = await fetch('/api/admin/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, details, resource, diff })
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || 'Could not record the audit event.');
  } catch (error) {
    console.error('[AdminAudit] Could not record staff activity:', error);
  }
}
