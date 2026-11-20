'use client';

import * as React from 'react';
import Link from 'next/link';
import {
    Check,
    Mail,
    MessageCircle,
    MessageSquare,
    Search,
    Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ContactType = 'rider' | 'supplier' | 'merchant' | 'retailer';
type ContactGroup = 'all' | ContactType;
type Channel = 'whatsapp' | 'sms' | 'email';

interface Contact {
    id: string;
    name: string;
    type: ContactType;
    area: string;
    status: string;
}

const CONTACTS: Contact[] = [
    { id: 'rider-1', name: 'Brian Otieno', type: 'rider', area: 'Kilimani', status: 'On shift' },
    { id: 'rider-2', name: 'Kevin Mwangi', type: 'rider', area: 'Westlands', status: 'On shift' },
    { id: 'rider-3', name: 'Faith Achieng', type: 'rider', area: 'South B', status: 'Off shift' },
    { id: 'rider-4', name: 'Samuel Kiptoo', type: 'rider', area: 'Rongai', status: 'On shift' },
    { id: 'supplier-1', name: 'Nairobi Wines Ltd', type: 'supplier', area: 'Industrial Area', status: 'Wine and spirits' },
    { id: 'supplier-2', name: 'Kenya Brew House', type: 'supplier', area: 'Ruaraka', status: 'Beer and cider' },
    { id: 'supplier-3', name: 'Fresh Ice Co', type: 'supplier', area: 'Embakasi', status: 'Ice and mixers' },
    { id: 'merchant-1', name: 'Mama Njeri Snacks', type: 'merchant', area: 'Kawangware', status: 'Bites and munchies' },
    { id: 'merchant-2', name: 'Giftbox Africa', type: 'merchant', area: 'Karen', status: 'Souvenirs and gifts' },
    { id: 'retailer-1', name: 'Corner Liquor Store', type: 'retailer', area: 'Roysambu', status: 'Retail partner' },
    { id: 'retailer-2', name: 'Lavington Cellar', type: 'retailer', area: 'Lavington', status: 'Retail partner' }
];

const GROUPS: { id: ContactGroup; label: string }[] = [
    { id: 'all', label: 'Everyone' },
    { id: 'rider', label: 'Riders' },
    { id: 'supplier', label: 'Suppliers' },
    { id: 'merchant', label: 'Merchants' },
    { id: 'retailer', label: 'Retailers' }
];

const CHANNELS: { id: Channel; label: string; icon: typeof MessageCircle }[] = [
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { id: 'sms', label: 'SMS', icon: MessageSquare },
    { id: 'email', label: 'Email', icon: Mail }
];

const TEMPLATES: Record<ContactGroup, string[]> = {
    all: [
        'Hi {name}, quick update from Online Bar.',
        'Happy weekend from the Online Bar team.'
    ],
    rider: [
        'Shift starts at 6pm. Reply YES to confirm.',
        'Heavy orders tonight, please come early.',
        'Payout for this week has been sent.'
    ],
    supplier: [
        'We need a restock by Friday. Can you confirm?',
        'Please send your latest price list.',
        'Delivery received, thank you.'
    ],
    merchant: [
        'New orders are coming in for your items.',
        'Please update your stock for the weekend.'
    ],
    retailer: [
        'New wholesale prices are ready for you.',
        'Your order is ready for pickup.'
    ]
};

const GROUP_COLORS: Record<ContactType, string> = {
    rider: 'bg-blue-100 text-blue-800',
    supplier: 'bg-amber-100 text-amber-800',
    merchant: 'bg-emerald-100 text-emerald-800',
    retailer: 'bg-violet-100 text-violet-800'
};

export default function ContactCenterSimulationPage() {
    const [group, setGroup] = React.useState<ContactGroup>('all');
    const [query, setQuery] = React.useState('');
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
    const [channel, setChannel] = React.useState<Channel>('whatsapp');
    const [message, setMessage] = React.useState('');
    const [error, setError] = React.useState('');
    const [result, setResult] = React.useState('');

    const visibleContacts = React.useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return CONTACTS.filter(contact => (
            (group === 'all' || contact.type === group)
            && (!normalizedQuery || `${contact.name} ${contact.area}`.toLowerCase().includes(normalizedQuery))
        ));
    }, [group, query]);
    const selectedContacts = CONTACTS.filter(contact => selectedIds.has(contact.id));
    const previewContact = selectedContacts[0];
    const messagePreview = message.trim()
        ? message.trim().replaceAll('{name}', previewContact?.name.split(' ')[0] || 'there')
        : 'Pick someone and write a message.';
    const allVisibleSelected = visibleContacts.length > 0
        && visibleContacts.every(contact => selectedIds.has(contact.id));

    const toggleContact = (id: string) => {
        setSelectedIds(current => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        setError('');
        setResult('');
    };

    const toggleAllVisible = () => {
        setSelectedIds(current => {
            const next = new Set(current);
            for (const contact of visibleContacts) {
                if (allVisibleSelected) next.delete(contact.id);
                else next.add(contact.id);
            }
            return next;
        });
        setError('');
        setResult('');
    };

    const handleSend = () => {
        if (selectedContacts.length === 0) {
            setError('Select at least one person first.');
            setResult('');
            return;
        }
        if (!message.trim()) {
            setError('Write a message before sending.');
            setResult('');
            return;
        }
        const channelLabel = CHANNELS.find(item => item.id === channel)?.label || channel;
        setError('');
        setResult(`Simulation only: ${selectedContacts.length} message${selectedContacts.length === 1 ? '' : 's'} would go out by ${channelLabel}. Nothing was sent.`);
    };

    return (
        <main className="min-h-screen space-y-6 bg-slate-50 p-4 pb-32 text-left sm:p-8">
            <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                        <MessageSquare size={15} /> Communications
                    </p>
                    <h1 className="text-3xl font-black uppercase tracking-tight text-foreground sm:text-4xl">Contact Center</h1>
                    <p className="mt-2 text-sm text-muted-foreground">Select a group, compose a message, and preview the contact-center workflow.</p>
                </div>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                    <Link href="/lord/broadcast">Open consent-based campaign tools</Link>
                </Button>
            </header>

            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
                <strong>Simulation only.</strong> Contacts below are sample records. This page does not send messages or access real customer data. Use the campaign tools for real, consent-based messaging.
            </div>

            <Card className="space-y-5 p-4 sm:p-6">
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Contact groups">
                    {GROUPS.map(item => {
                        const count = item.id === 'all'
                            ? CONTACTS.length
                            : CONTACTS.filter(contact => contact.type === item.id).length;
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
                                {item.label} ({count})
                            </button>
                        );
                    })}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Sample contacts">
                        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
                            <Search size={17} className="shrink-0 text-slate-400" />
                            <input
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                placeholder="Search name or area"
                                aria-label="Search name or area"
                                className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
                            />
                        </div>
                        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 text-xs text-slate-500">
                            <label className="flex cursor-pointer items-center gap-2">
                                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                                Select all shown
                            </label>
                            <span className="flex items-center gap-1 font-semibold"><Users size={14} /> {selectedContacts.length} selected</span>
                        </div>
                        <div className="max-h-[28rem] overflow-y-auto">
                            {visibleContacts.length === 0 ? (
                                <p className="p-6 text-center text-sm text-slate-500">No contacts match. Try another group or search.</p>
                            ) : visibleContacts.map(contact => (
                                <label key={contact.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(contact.id)}
                                        onChange={() => toggleContact(contact.id)}
                                        aria-label={`Select ${contact.name}`}
                                    />
                                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black', GROUP_COLORS[contact.type])}>
                                        {contact.name.split(' ').map(part => part[0]).slice(0, 2).join('')}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-bold text-slate-900">{contact.name}</span>
                                        <span className="block truncate text-xs text-slate-500">{contact.area} · {contact.status}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Message composer">
                        <div>
                            <p className="mb-2 text-xs font-semibold text-slate-500">Send by</p>
                            <div className="grid grid-cols-3 gap-2">
                                {CHANNELS.map(item => {
                                    const Icon = item.icon;
                                    return (
                                        <Button
                                            key={item.id}
                                            type="button"
                                            variant={channel === item.id ? 'default' : 'outline'}
                                            aria-pressed={channel === item.id}
                                            onClick={() => { setChannel(item.id); setResult(''); }}
                                            className="min-w-0 px-2 text-xs sm:text-sm"
                                        >
                                            <Icon size={15} className="mr-1.5 shrink-0" />
                                            {item.label}
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <p className="mb-2 text-xs font-semibold text-slate-500">Quick messages</p>
                            <div className="flex flex-wrap gap-2">
                                {(TEMPLATES[group] || TEMPLATES.all).map(template => (
                                    <button
                                        key={template}
                                        type="button"
                                        onClick={() => { setMessage(template); setError(''); setResult(''); }}
                                        className="rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 hover:border-primary/40 hover:bg-primary/5"
                                    >
                                        {template}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="contact-center-message" className="mb-2 block text-xs font-semibold text-slate-500">
                                Message <span className="font-normal">(use {'{name}'} for their first name)</span>
                            </label>
                            <Textarea
                                id="contact-center-message"
                                value={message}
                                onChange={event => { setMessage(event.target.value); setError(''); setResult(''); }}
                                maxLength={2000}
                                rows={4}
                                placeholder="Hi {name}, we need you at the shop by 6pm"
                                className="resize-y"
                            />
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4 text-sm">
                            <p className="mb-1 text-xs text-slate-500">
                                Preview for <strong className="text-slate-800">{previewContact?.name || 'nobody yet'}</strong>
                            </p>
                            <p className="whitespace-pre-wrap text-slate-800">{messagePreview}</p>
                        </div>

                        {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
                        {result && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{result}</p>}

                        <Button type="button" onClick={handleSend} className="w-full">
                            <Check size={16} className="mr-2" />
                            Simulate for {selectedContacts.length} {selectedContacts.length === 1 ? 'person' : 'people'}
                        </Button>
                    </section>
                </div>
            </Card>
        </main>
    );
}
