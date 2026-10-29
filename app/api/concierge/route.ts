import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 12;

type Scenario = {
  id: string;
  name: string;
  triggers: string[];
  replies: Record<string, string>;
  mode: 'exact' | 'guided';
  action: 'none' | 'support';
  chips: string[];
  status: 'draft' | 'testing' | 'live';
  used_count: number;
};

function normalized(value: string) {
  return value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function languageFor(message: string): 'en' | 'sw' | 'sheng' {
  const text = normalized(message);
  if (/\b(niaje|maze|sasa|poa|sheng|wasee|manze|rada)\b/.test(text)) return 'sheng';
  if (/\b(habari|tafadhali|samahani|asante|nisaidie|naomba|bei|pombe|delivery yangu)\b/.test(text)) return 'sw';
  return 'en';
}

function matchScenario(message: string, scenarios: Scenario[]) {
  const text = normalized(message);
  return scenarios
    .filter(scenario => scenario.status === 'live')
    .flatMap(scenario => scenario.triggers.map(trigger => ({
      scenario,
      trigger: normalized(trigger)
    })))
    .filter(match => match.trigger.length >= 3 && text.includes(match.trigger))
    .sort((left, right) => right.trigger.length - left.trigger.length)[0]?.scenario || null;
}

function messageBudget(message: string) {
  const text = normalized(message);
  const compact = text.match(/\b(?:under|below|budget|kes|ksh)\s*(\d+(?:\.\d+)?)\s*(k)?\b/);
  if (!compact) return null;
  const amount = Number(compact[1]) * (compact[2] ? 1000 : 1);
  return Number.isFinite(amount) && amount >= 100 && amount <= 1_000_000 ? amount : null;
}

function isNonAlcoholic(product: { name: string; category: string | null; sub_category: string | null }) {
  return !/(alcohol|spirit|wine|beer|whisk|whiskey|gin|vodka|tequila|rum|brandy|liqueur|champagne|cognac|cider)/i
    .test([product.name, product.category, product.sub_category].filter(Boolean).join(' '));
}

function sanitizeUnmatchedMessage(message: string) {
  return message.slice(0, 500)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]');
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  let body: { message?: unknown; ageConfirmed?: unknown; logUnmatched?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Send a valid concierge message.' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 500) {
    return NextResponse.json({ error: 'Messages must contain between 1 and 500 characters.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'The concierge is temporarily unavailable because the catalog connection is not configured.' }, { status: 503 });
  }

  const clientAddress = request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const identityHash = createHash('sha256').update(clientAddress).digest('hex');
  const { data: allowed, error: rateError } = await database.rpc('allow_concierge_request', {
    p_identity_hash: identityHash,
    p_max_requests: 12,
    p_window_seconds: 3600
  });
  if (rateError) {
    console.error('[Concierge] Could not enforce the request limit:', rateError.message);
    return NextResponse.json({
      error: 'The concierge request limit is temporarily unavailable. Please try again shortly.'
    }, { status: 503 });
  }
  if (!allowed) {
    return NextResponse.json({ error: 'You have reached the concierge limit. Please try again in an hour.' }, { status: 429 });
  }

  const [scenarioResult, productResult] = await Promise.all([
    database.from('concierge_scenarios')
      .select('id,name,triggers,replies,mode,action,chips,status,used_count')
      .eq('status', 'live')
      .limit(200),
    database.from('products')
      .select('id,name,price,image_url,category,sub_category,stock,status,hide_product,is_available_now')
      .gt('stock', 0)
      .eq('is_available_now', true)
      .order('price', { ascending: true })
      .limit(200)
      .abortSignal(AbortSignal.timeout(8_000))
  ]);
  if (productResult.error) {
    console.error('[Concierge] Could not check live product stock:', productResult.error.message);
    return NextResponse.json({ error: 'I could not check live stock just now. Please try again shortly.' }, { status: 503 });
  }

  let scenarios: Scenario[] = [];
  let scenarioStorageReady = true;
  if (scenarioResult.error) {
    if (['42P01', 'PGRST205'].includes(scenarioResult.error.code || '')) {
      scenarioStorageReady = false;
      console.warn('[Concierge] Scenario storage is not installed; using the safe catalog fallback.');
    } else {
      console.error('[Concierge] Could not load published replies:', scenarioResult.error.message);
      return NextResponse.json({ error: 'Saved concierge replies could not be loaded.' }, { status: 503 });
    }
  } else {
    scenarios = (scenarioResult.data || []) as Scenario[];
  }

  const scenario = matchScenario(message, scenarios);
  const language = languageFor(message);
  const ageConfirmed = body.ageConfirmed === true;
  const listedProducts = (productResult.data || [])
    .filter(isStorefrontProductVisible)
    .filter(product => Number(product.stock || 0) > 0);
  const products = listedProducts
    .filter(product => ageConfirmed || isNonAlcoholic(product))
    .filter(product => {
      const text = normalized(message);
      if (text.includes('no alcohol') || text.includes('non alcoholic') || text.includes('food only')) {
        return isNonAlcoholic(product);
      }
      return true;
    });
  const budget = messageBudget(message);
  const withinBudget = budget === null ? products : products.filter(product => Number(product.price) <= budget);
  const recommendations = withinBudget.slice(0, 3).map(product => ({
    id: Number(product.id),
    name: product.name,
    price: Number(product.price),
    image_url: product.image_url || '',
    category: product.category || 'General',
    stock: Number(product.stock || 0)
  }));

  let response = scenario?.replies?.[language] || scenario?.replies?.en || '';
  if (scenario?.id) {
    const { error: usageError } = await database.from('concierge_scenarios')
      .update({ used_count: Math.max(0, Number(scenario.used_count || 0)) + 1 })
      .eq('id', scenario.id);
    if (usageError) console.warn('[Concierge] Scenario usage could not be recorded:', usageError.message);
  }

  if (!response) {
    if (recommendations.length) {
      response = language === 'sw'
        ? 'Nimeangalia bidhaa zilizo na stock sasa. Hizi ndizo chaguo zinazolingana na unachotafuta; bei ni za catalog ya sasa.'
        : language === 'sheng'
          ? 'Nimecheck stock ya sasa. Hizi options ziko kwa catalog live—bei ni za sasa.'
          : 'I’ve checked the live catalog. These options are currently in stock; prices are from the current listing.';
    } else if (budget !== null) {
      response = `I couldn't find an in-stock match under KES ${budget.toLocaleString('en-KE')}. I won't guess at a price—would you like to browse the full menu or speak to our team?`;
    } else {
      response = 'I couldn’t match that to an in-stock listing. I can check the live catalog if you tell me what you’re planning, your budget, or the item you want.';
    }
  }

  const matchedTrigger = scenario
    ? scenario.triggers.find(trigger => normalized(message).includes(normalized(trigger))) || ''
    : '';
  let unmatchedLogged = false;
  if (!scenario && body.logUnmatched === true) {
    const { error: logError } = await database.from('concierge_unmatched_questions').insert({
      message: sanitizeUnmatchedMessage(message)
    });
    if (logError) {
      if (['42P01', 'PGRST205'].includes(logError.code || '')) {
        console.warn('[Concierge] Unanswered question storage is not installed.');
      } else {
        console.error('[Concierge] Could not save the opt-in unanswered question:', logError.message);
        return NextResponse.json({ error: 'Your message could not be saved for review. Please try again.' }, { status: 503 });
      }
    } else {
      unmatchedLogged = true;
    }
  }

  return NextResponse.json({
    response,
    recommendations,
    scenario: scenario ? { id: scenario.id, name: scenario.name, mode: scenario.mode, action: scenario.action } : null,
    action: scenario?.action || (recommendations.length ? 'none' : 'support'),
    chips: scenario?.chips || ['Make it cheaper', 'Add snacks', 'No alcohol'],
    unmatchedLogged,
    scenarioStorageReady,
    matchedTrigger,
    ageNotice: !ageConfirmed && listedProducts.some(product => !isNonAlcoholic(product))
      ? 'Alcohol suggestions are hidden until you confirm you are 18 or older.'
      : undefined
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
