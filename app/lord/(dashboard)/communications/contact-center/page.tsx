'use client';

import * as React from 'react';
import Link from 'next/link';
import {
    AlertCircle,
    Loader2,
    Mail,
    MessageSquare,
    Phone,
    RefreshCw,
    Search,
    Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ContactType = 'rider' | 'supplier' | 'merchant' | 'retailer';
type ContactGroup = 'all' | ContactType;

interface Contact {
    id: string;
    name: string;
    contactName: string | null;
    type: ContactType;
    phone: string | null;
    email: string | null;
    area: string | null;
    status: string | null;
}


const GROUPS: { id: ContactGroup; label: string }[] = [
    { id: 'all', label: 'All contacts' },
    { id: 'rider', label: 'Riders' },
    { id: 'supplier', label: 'Suppliers' },
    { id: 'merchant', label: 'Merchants' },
    { id: 'retailer', label: 'Retailers' }
];

const GROUP_COLORS: Record<ContactType, string> = {
    rider: 'bg-blue-100 text-blue-800',
    supplier: 'bg-amber-100 text-amber-800',
    merchant: 'bg-emerald-100 text-emerald-800',
    retailer: 'bg-violet-100 text-violet-800'
};

function safePhoneHref(phone: string | null) {
    if (!phone) return null;
    const value = phone.replace(/[^\d+]/g, '');
    return value.replace(/\D/g, '').length >= 7 ? `tel:${value}` : null;
}

function safeEmailHref(email: string | null) {
    const value = email?.trim();
    return value && /^[^\s@<>?&#,;]+@[^\s@<>?&#,;]+\.[^\s@<>?&#,;]+$/.test(value)
        ? `mailto:${value}`
        : null;
}

export default function ContactCenterPage() {
    const [group, setGroup] = React.useState<ContactGroup>('all');
    const [query, setQuery] = React.useState('');
    const [contacts, setContacts] = React.useState<Contact[]>([]);
    const [warnings, setWarnings] = React.useState<string[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [generatedAt, setGeneratedAt] = React.useState<string | null>(null);
    const [refreshKey, setRefreshKey] = React.useState(0);

    React.useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setContacts([]);
        setWarnings([]);
        setGeneratedAt(null);
        void fetch('/api/admin/communications/contacts', {
            cache: 'no-store',
            signal: controller.signal
        }).then(async response => {
            const payload = await response.json() as {
                contacts?: Contact[];
                warnings?: string[];
                generatedAt?: string;
                error?: string;
            };
            if (!response.ok) throw new Error(payload.error || 'Live contact records could not be loaded.');
            if (!Array.isArray(payload.contacts)) throw new Error('The live contact directory returned an invalid response.');
            setContacts(payload.contacts);
            setWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
            setGeneratedAt(typeof payload.generatedAt === 'string' ? payload.generatedAt : null);
        }).catch(loadError => {
            if (controller.signal.aborted) return;
            setError(loadError instanceof Error ? loadError.message : 'Live contact records could not be loaded.');
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [refreshKey]);

    const visibleContacts = React.useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return contacts.filter(contact => (
            (group === 'all' || contact.type === group)
            && (!normalizedQuery || [
                contact.name,
                contact.contactName,
                contact.area,
                contact.phone,
                contact.email,
                contact.status
            ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery))
        ));
    }, [contacts, group, query]);

    return (
        <main className="min-h-screen space-y-6 bg-slate-50 p-4 pb-32 text-left sm:p-8">
            <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                        <MessageSquare size={15} /> Communications
                    </p>
                    <h1 className="text-3xl font-black uppercase tracking-tight text-foreground sm:text-4xl">Contact Center</h1>
                    <p className="mt-2 text-sm text-muted-foreground">Current rider, supplier, and merchant contacts from OnBar operational records.</p>
                </div>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                    <Link href="/lord/broadcast">Open consent-based campaign tools</Link>
                </Button>
            </header>

            <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-relaxed text-sky-950">
                This directory reads current operational partner records. It does not send messages; use the campaign tools for consent-based customer messaging.
            </div>

            <Card className="space-y-5 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Contact groups">
                    {GROUPS.map(item => {
                        const count = item.id === 'all'
                            ? contacts.length
                            : contacts.filter(contact => contact.type === item.id).length;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={group === item.id}
                                onClick={() => setGroup(item.id)}
                                className={cn(
                                    'rounded-full border px-4 py-2 text-xs font-bold transition-colors',
                                    group === item.id
                                        ? 'border-primary bg-primary text-white'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-primary/40'
                                )}
                            >
                                {item.label} ({loading ? '…' : count})
                            </button>
                        );
                    })}
                    </div>
                    <Button type="button" variant="outline" disabled={loading} onClick={() => setRefreshKey(current => current + 1)}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Refresh directory
                    </Button>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4">
                    <Search size={17} className="shrink-0 text-slate-400" />
                    <input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search name, location, phone, email, or status"
                        aria-label="Search contacts"
                        className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                </div>

                {generatedAt && !loading && <p className="text-xs text-slate-500">
                    Live records refreshed {new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(generatedAt))}
                </p>}
                {warnings.map(warning => <p key={warning} role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" /> {warning}
                </p>)}
                {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Live contacts">
                    {loading ? (
                        <div role="status" className="flex items-center justify-center gap-3 p-10 text-sm text-slate-500">
                            <Loader2 className="h-5 w-5 animate-spin" /> Loading current contact records…
                        </div>
                    ) : !error && visibleContacts.length === 0 ? (
                        <p className="p-8 text-center text-sm text-slate-500">
                            {contacts.length ? 'No live contacts match. Try another group or search.' : 'No contact records are available in the operational database.'}
                        </p>
                    ) : !error && visibleContacts.map(contact => {
                        const phoneHref = safePhoneHref(contact.phone);
                        const emailHref = safeEmailHref(contact.email);
                        return (
                            <article key={contact.id} className="flex flex-col gap-3 border-b border-slate-100 p-4 last:border-0 sm:flex-row sm:items-center">
                                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black', GROUP_COLORS[contact.type])}>
                                    {contact.name.split(' ').map(part => part[0]).slice(0, 2).join('')}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="truncate text-sm font-bold text-slate-900">{contact.name}</h2>
                                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', GROUP_COLORS[contact.type])}>
                                            {contact.type}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {[contact.contactName, contact.area, contact.status].filter(Boolean).join(' · ') || 'No additional record details'}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                        {phoneHref
                                            ? <a href={phoneHref} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"><Phone size={13} /> {contact.phone}</a>
                                            : contact.phone && <span className="text-slate-500"><Phone size={13} className="mr-1 inline" />{contact.phone}</span>}
                                        {emailHref
                                            ? <a href={emailHref} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"><Mail size={13} /> {contact.email}</a>
                                            : contact.email
                                                ? <span className="text-slate-500"><Mail size={13} className="mr-1 inline" />{contact.email}</span>
                                                : <span className="text-slate-400">No email on record</span>}
                                        {!contact.phone && <span className="text-slate-400">No phone on record</span>}
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                    {!loading && !error && visibleContacts.length > 0 && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                        <Users size={14} className="mr-1 inline" /> {visibleContacts.length} live contact{visibleContacts.length === 1 ? '' : 's'}
                    </p>}
                </section>
            </Card>
        </main>
    );
}
