import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };
const pageSize = 500;
const maxContactRows = 10_000;

type DatabaseError = { code?: string; message: string };
type QueryPage<T> = { data: T[] | null; error: DatabaseError | null };
type QueryRows<T> = { rows: T[]; error: DatabaseError | null; truncated: boolean };

type ContactType = 'rider' | 'supplier' | 'merchant' | 'retailer';
type Contact = {
  id: string;
  name: string;
  contactName: string | null;
  type: ContactType;
  phone: string | null;
  email: string | null;
  area: string | null;
  status: string | null;
};

type RiderRow = {
  id: number | string;
  rider_name: string;
  rider_phone: string;
  rider_email?: string | null;
  status: string | null;
  verification_status: string | null;
  area_zone: string | null;
};

type SupplierRow = {
  id: number | string;
  name: string;
  email: string | null;
  phone: string | null;
  verification_status: string | null;
  is_active: boolean | null;
};

type MerchantApplicationRow = {
  id: string;
  business_name: string;
  trading_name: string | null;
  business_type: string;
  vendor_type: string | null;
  email: string | null;
  phone: string | null;
  owner_name: string | null;
  status: string;
  town: string | null;
  county: string | null;
};

type LegacyVendorRow = {
  id: string;
  name: string;
  email: string | null;
  status: string | null;
};

type MarketMerchantRow = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
};

type MarketApplicationRow = {
  id: string;
  business_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: string;
};

async function loadAllRows<T>(
  readPage: (from: number, to: number) => Promise<QueryPage<T>>
): Promise<QueryRows<T>> {
  const rows: T[] = [];
  for (let from = 0; from < maxContactRows; from += pageSize) {
    const { data, error } = await readPage(from, from + pageSize - 1);
    if (error) return { rows, error, truncated: false };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return { rows, error: null, truncated: false };
  }
  return { rows, error: null, truncated: true };
}

function isMissingColumn(error: DatabaseError, column: string) {
  const columnMentioned = new RegExp(column, 'i').test(error.message);
  return (error.code === '42703' || ['PGRST204', 'PGRST205'].includes(error.code || ''))
      && columnMentioned
    || new RegExp(`column .*${column}|${column}.*does not exist|${column}.*schema cache`, 'i').test(error.message);
}

function isMissingSchema(error: DatabaseError) {
  return ['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code || '')
    || /does not exist|schema cache|could not find the table/i.test(error.message);
}

function normalizedIdentity(contact: Contact) {
  const identifier = contact.email?.trim().toLowerCase()
    || contact.phone?.replace(/\D/g, '')
    || contact.id;
  return `${contact.type}:${contact.name.trim().toLowerCase()}:${identifier}`;
}

function joinArea(...parts: Array<string | null | undefined>) {
  const values = parts.map(part => part?.trim()).filter((part): part is string => Boolean(part));
  return values.length ? [...new Set(values)].join(' · ') : null;
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 401, headers: noStore });
  }
  if (!hasAdminPermission(session, 'can_manage_communications')) {
    return NextResponse.json({ error: 'Contact directory access requires communications permission.' }, { status: 403, headers: noStore });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Contact directory database access is not configured on the server.' }, { status: 503, headers: noStore });
  }

  const warnings: string[] = [];
  const riderRead = (includeEmail: boolean) => loadAllRows<RiderRow>(async (from, to) => {
    if (includeEmail) {
      const { data, error } = await database.from('rider_status')
        .select('id, rider_name, rider_phone, rider_email, status, verification_status, area_zone')
        .order('rider_name')
        .range(from, to);
      return { data: data as RiderRow[] | null, error };
    }
    const { data, error } = await database.from('rider_status')
      .select('id, rider_name, rider_phone, status, verification_status, area_zone')
      .order('rider_name')
      .range(from, to);
    return { data: data as RiderRow[] | null, error };
  });

  let ridersResult = await riderRead(true);
  if (ridersResult.error && isMissingColumn(ridersResult.error, 'rider_email')) {
    warnings.push('Rider email addresses are unavailable until the rider email communications migration is applied.');
    ridersResult = await riderRead(false);
  }

  const [suppliersResult, merchantApplicationsResult, legacyVendorsResult, marketMerchantsResult, marketApplicationsResult] = await Promise.all([
    loadAllRows<SupplierRow>(async (from, to) => await database
      .from('suppliers')
      .select('id, name, email, phone, verification_status, is_active')
      .order('name')
      .range(from, to)),
    loadAllRows<MerchantApplicationRow>(async (from, to) => await database
      .from('merchant_applications')
      .select('id, business_name, trading_name, business_type, vendor_type, email, phone, owner_name, status, town, county')
      .order('business_name')
      .range(from, to)),
    loadAllRows<LegacyVendorRow>(async (from, to) => await database
      .from('marketplace_vendors')
      .select('id, name, email, status')
      .order('name')
      .range(from, to)),
    loadAllRows<MarketMerchantRow>(async (from, to) => await database
      .from('mm_merchants')
      .select('id, name, contact_name, contact_email, contact_phone, status')
      .order('name')
      .range(from, to)),
    loadAllRows<MarketApplicationRow>(async (from, to) => await database
      .from('mm_merchant_applications')
      .select('id, business_name, contact_name, contact_email, contact_phone, status')
      .in('status', ['submitted', 'under_review', 'information_requested'])
      .order('business_name')
      .range(from, to))
  ]);

  const sources = [
    { name: 'Rider', result: ridersResult },
    { name: 'Supplier', result: suppliersResult },
    { name: 'merchant application', result: merchantApplicationsResult },
    { name: 'legacy marketplace vendor', result: legacyVendorsResult },
    { name: 'marketplace merchant', result: marketMerchantsResult },
    { name: 'marketplace application', result: marketApplicationsResult }
  ];
  const fatalErrors = sources.filter(source => source.result.error && !isMissingSchema(source.result.error));
  if (fatalErrors.length) {
    console.error('[ContactCenter] Could not load live contact records:', fatalErrors.map(source => source.result.error?.message).join(' '));
    return NextResponse.json({ error: 'Live contact records could not be loaded. Refresh and try again.' }, { status: 503, headers: noStore });
  }

  for (const source of sources) {
    if (source.result.error) {
      console.error(`[ContactCenter] ${source.name} contact source is unavailable:`, source.result.error);
      warnings.push(`${source.name} records are unavailable because their database schema is not installed.`);
    }
    if (source.result.truncated) {
      warnings.push(`The directory limit was reached while loading ${source.name.toLowerCase()} records.`);
    }
  }

  const contactsByIdentity = new Map<string, Contact>();
  const addContact = (contact: Contact) => {
    if (!contact.name.trim()) return;
    const key = normalizedIdentity(contact);
    const existing = contactsByIdentity.get(key);
    if (!existing) {
      contactsByIdentity.set(key, contact);
      return;
    }
    contactsByIdentity.set(key, {
      ...existing,
      contactName: existing.contactName || contact.contactName,
      phone: existing.phone || contact.phone,
      email: existing.email || contact.email,
      area: existing.area || contact.area,
      status: existing.status || contact.status
    });
  };

  for (const row of (ridersResult.error ? [] : ridersResult.rows) as RiderRow[]) {
    addContact({
      id: `rider:${row.id}`,
      name: row.rider_name,
      contactName: null,
      type: 'rider',
      phone: row.rider_phone,
      email: row.rider_email || null,
      area: row.area_zone,
      status: joinArea(row.status, row.verification_status)
    });
  }

  for (const row of (suppliersResult.error ? [] : suppliersResult.rows) as SupplierRow[]) {
    addContact({
      id: `supplier:${row.id}`,
      name: row.name,
      contactName: null,
      type: 'supplier',
      phone: row.phone,
      email: row.email,
      area: null,
      status: joinArea(row.verification_status, row.is_active === null ? null : row.is_active ? 'Active' : 'Inactive')
    });
  }

  for (const row of (merchantApplicationsResult.error ? [] : merchantApplicationsResult.rows) as MerchantApplicationRow[]) {
    const type: ContactType = row.business_type === 'supplier' || row.vendor_type === 'wholesaler'
      ? 'supplier'
      : row.business_type === 'bar' && row.vendor_type === 'retailer'
        ? 'retailer'
        : 'merchant';
    addContact({
      id: `merchant-application:${row.id}`,
      name: row.trading_name?.trim() || row.business_name,
      contactName: row.owner_name,
      type,
      phone: row.phone,
      email: row.email,
      area: joinArea(row.town, row.county),
      status: row.status
    });
  }

  for (const row of (legacyVendorsResult.error ? [] : legacyVendorsResult.rows) as LegacyVendorRow[]) {
    addContact({
      id: `marketplace-vendor:${row.id}`,
      name: row.name,
      contactName: null,
      type: 'merchant',
      phone: null,
      email: row.email,
      area: null,
      status: row.status
    });
  }

  for (const row of (marketMerchantsResult.error ? [] : marketMerchantsResult.rows) as MarketMerchantRow[]) {
    addContact({
      id: `market-merchant:${row.id}`,
      name: row.name,
      contactName: row.contact_name,
      type: 'merchant',
      phone: row.contact_phone,
      email: row.contact_email,
      area: null,
      status: row.status
    });
  }

  for (const row of (marketApplicationsResult.error ? [] : marketApplicationsResult.rows) as MarketApplicationRow[]) {
    addContact({
      id: `market-application:${row.id}`,
      name: row.business_name,
      contactName: row.contact_name,
      type: 'merchant',
      phone: row.contact_phone,
      email: row.contact_email,
      area: null,
      status: row.status
    });
  }

  const contacts = [...contactsByIdentity.values()].sort((left, right) =>
    left.type.localeCompare(right.type) || left.name.localeCompare(right.name)
  );
  return NextResponse.json({
    contacts,
    warnings,
    generatedAt: new Date().toISOString()
  }, { headers: noStore });
}
