export interface PublicLaunchGate {
  active: boolean;
  releaseAt: string | null;
}

export function isPublicSiteLocked(
  gate: PublicLaunchGate | null,
  now = Date.now()
): boolean {
  if (!gate?.active) return false;
  if (!gate.releaseAt) return true;
  const releaseAt = Date.parse(gate.releaseAt);
  return Number.isNaN(releaseAt) || releaseAt > now;
}

export function parsePublicLaunchGate(value: unknown): PublicLaunchGate | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.active !== 'boolean') return null;
  if (candidate.releaseAt !== null && typeof candidate.releaseAt !== 'string') return null;
  if (typeof candidate.releaseAt === 'string' && Number.isNaN(Date.parse(candidate.releaseAt))) return null;
  return { active: candidate.active, releaseAt: candidate.releaseAt as string | null };
}
