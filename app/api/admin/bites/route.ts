import { NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

type ProductPayload = {
  name?: unknown;
  category?: unknown;
  price?: unknown;
  stock?: unknown;
  [key: string]: unknown;
};

async function authorize() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (
    !['owner', 'admin'].includes(session.role.toLowerCase())
    && session.permissions.can_manage_inventory !== true
    && session.permissions.can_manage_orders !== true
  ) {
    return { response: NextResponse.json({ error: 'Food inventory management access required.' }, { status: 403 }) };
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.' }, { status: 503 }) };
  }
  return { database };
}

export async function GET() {
  const access = await authorize();
  if ('response' in access) return access.response;

  const { data, error } = await access.database
    .from('products')
    .select('*')
    .or('is_bite.eq.true,is_snack.eq.true,category.ilike.%snack%,category.ilike.%munch%')
    .order('name');
  if (error) {
    console.error('[AdminBites] Could not load food products:', error);
    return NextResponse.json({ error: `Food products could not be loaded: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ products: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: { product?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid food product is required.' }, { status: 400 });
  }
  if (typeof body.product !== 'object' || body.product === null || Array.isArray(body.product)) {
    return NextResponse.json({ error: 'A valid food product is required.' }, { status: 400 });
  }

  const product = body.product as ProductPayload;
  const price = Number(product.price);
  const stock = Number(product.stock);
  if (
    typeof product.name !== 'string' || !product.name.trim()
    || typeof product.category !== 'string' || !['Food', 'Snacks'].includes(product.category.trim())
    || !Number.isFinite(price) || price <= 0
    || !Number.isSafeInteger(stock) || stock < 0
  ) {
    return NextResponse.json({ error: 'Enter a product name, category, positive price, and non-negative whole stock quantity.' }, { status: 400 });
  }

  const payload = {
    ...product,
    name: product.name.trim(),
    category: product.category.trim(),
    price,
    stock,
    is_snack: product.category.trim().toLowerCase() === 'snacks',
    is_bite: product.category.trim().toLowerCase() === 'food',
    is_available_now: stock > 0,
    status: 'Live'
  };
  const { data, error } = await access.database.from('products').insert(payload).select('*').single();
  if (error) {
    console.error('[AdminBites] Could not create food product:', error);
    return NextResponse.json({ error: `Food product could not be saved: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ product: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: { id?: unknown; status?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid product ID and status are required.' }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1 || !['Live', 'Draft'].includes(String(body.status))) {
    return NextResponse.json({ error: 'A valid product ID and status are required.' }, { status: 400 });
  }

  const status = body.status as 'Live' | 'Draft';
  const { data, error } = await access.database
    .from('products')
    .update({ status, is_available_now: status === 'Live' })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) {
    console.error('[AdminBites] Could not update food product:', error);
    return NextResponse.json({ error: `Food product could not be updated: ${error.message}` }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Food product not found.' }, { status: 404 });
  return NextResponse.json({ product: data });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: { id?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid product ID is required.' }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: 'A valid product ID is required.' }, { status: 400 });
  }

  const { data, error } = await access.database.from('products').delete().eq('id', id).select('id').maybeSingle();
  if (error) {
    console.error('[AdminBites] Could not delete food product:', error);
    return NextResponse.json({ error: `Food product could not be deleted: ${error.message}` }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Food product not found.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
