import defaultPromptData from '@/public/games/spin-the-bottle-prompts.json';

export type SpinBottlePrompt = {
  id: string;
  k: 'truth' | 'dare';
  l: 1 | 2 | 3 | 4;
  q: string;
  s: number;
};

export type ParsedSpinBottlePrompts =
  | { ok: true; prompts: SpinBottlePrompt[] }
  | { ok: false; error: string };

export function parseSpinBottlePrompts(value: unknown): ParsedSpinBottlePrompts {
  if (!Array.isArray(value) || value.length < 8 || value.length > 300) {
    return { ok: false, error: 'Keep between 8 and 300 prompts in the deck.' };
  }

  const ids = new Set<string>();
  const coverage = new Set<string>();
  const prompts: SpinBottlePrompt[] = [];

  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      return { ok: false, error: 'Every prompt must be a valid prompt record.' };
    }

    const prompt = candidate as Record<string, unknown>;
    const duration = prompt.s === undefined ? 0 : prompt.s;
    if (typeof prompt.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(prompt.id) || ids.has(prompt.id)
      || (prompt.k !== 'truth' && prompt.k !== 'dare')
      || !Number.isInteger(prompt.l) || Number(prompt.l) < 1 || Number(prompt.l) > 4
      || typeof prompt.q !== 'string' || !prompt.q.trim() || prompt.q.trim().length > 300
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(prompt.q)
      || !Number.isInteger(duration) || Number(duration) < 0 || Number(duration) > 180
      || (prompt.k === 'truth' && Number(duration) !== 0)) {
      return { ok: false, error: 'Check each prompt: use unique IDs, text up to 300 characters, levels 1–4, and dare timers from 0–180 seconds.' };
    }

    ids.add(prompt.id);
    coverage.add(`${prompt.l}:${prompt.k}`);
    prompts.push({
      id: prompt.id,
      k: prompt.k,
      l: prompt.l as SpinBottlePrompt['l'],
      q: prompt.q.trim(),
      s: Number(duration)
    });
  }

  for (let level = 1; level <= 4; level += 1) {
    if (!coverage.has(`${level}:truth`) || !coverage.has(`${level}:dare`)) {
      return { ok: false, error: 'Keep at least one truth and one dare at each difficulty level.' };
    }
  }

  return { ok: true, prompts };
}

const defaultPromptResult = parseSpinBottlePrompts(defaultPromptData);
if (!defaultPromptResult.ok) {
  throw new Error(`The built-in Spin the Bottle prompt deck is invalid: ${defaultPromptResult.error}`);
}

export const DEFAULT_SPIN_BOTTLE_PROMPTS = defaultPromptResult.prompts;
