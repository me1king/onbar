'use client';

import { useState } from 'react';
import { Check, Copy, Eye, Code2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LIFECYCLE_EMAIL_PREVIEWS, renderLifecycleEmailPreview, type LifecycleEmailPreviewId } from '@/lib/lifecycleEmailPreviews';

export default function LifecycleEmailPreview() {
  const [selectedId, setSelectedId] = useState<LifecycleEmailPreviewId>('waitlist');
  const [showHtml, setShowHtml] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const selected = LIFECYCLE_EMAIL_PREVIEWS.find(item => item.id === selectedId) || LIFECYCLE_EMAIL_PREVIEWS[0];
  const html = renderLifecycleEmailPreview(selectedId);

  async function copyHtml() {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[LifecycleEmailPreview] Could not copy email HTML:', error);
      setCopyError('Could not access the clipboard. Select and copy the HTML manually.');
    }
  }

  return (
    <Card className="space-y-5 rounded-2xl p-5 sm:p-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Email design previews</p>
        <h2 className="mt-1 text-xl font-black">See each email before it goes out</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          These are sample designs with example details. Order emails use live order data; partner and launch messages are sent from their own workflows.
        </p>
      </div>

      <div role="tablist" aria-label="Email preview scenarios" className="flex flex-wrap gap-2">
        {LIFECYCLE_EMAIL_PREVIEWS.map(item => (
          <button
            key={item.id}
            id={`email-preview-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={selectedId === item.id}
            aria-controls="email-preview-panel"
            onClick={() => { setSelectedId(item.id); setShowHtml(false); }}
            className={`rounded-full border px-3 py-2 text-xs font-bold transition-colors ${
              selectedId === item.id
                ? 'border-amber-500 bg-amber-100 text-amber-950'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id="email-preview-panel" role="tabpanel" aria-labelledby={`email-preview-tab-${selectedId}`} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{selected.label}</p>
            <p className="mt-1 break-words text-sm font-bold text-slate-900">Subject: {selected.subject}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowHtml(value => !value)}>
              {showHtml ? <Eye className="mr-2 h-4 w-4" /> : <Code2 className="mr-2 h-4 w-4" />}
              {showHtml ? 'Show preview' : 'Show HTML'}
            </Button>
            {showHtml && (
              <Button type="button" variant="outline" size="sm" onClick={() => void copyHtml()}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? 'Copied' : 'Copy sample HTML'}
              </Button>
            )}
          </div>
        </div>
        {showHtml ? (
          <textarea
            aria-label={`${selected.label} email HTML`}
            readOnly
            value={html}
            className="h-[520px] w-full resize-y rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"
          />
        ) : (
          <iframe
            title={`${selected.label} email preview`}
            sandbox=""
            srcDoc={html}
            className="h-[680px] w-full rounded-xl border border-slate-200 bg-white"
          />
        )}
      </div>

      {selectedId === 'waitlist' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
          The launch hero image is not in this workspace yet, so the preview does not include it. Add the provided <code>hero.png</code> under <code>public/emails/</code> before using it in a real send.
        </p>
      )}
      {selectedId === 'rider-welcome' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
          The PIN shown in this sample is for preview only. Real approval emails use the rider’s generated sign-in PIN.
        </p>
      )}
      {copyError && <p role="alert" className="text-xs font-semibold text-rose-700">{copyError}</p>}

      <p className="text-xs leading-relaxed text-slate-500">
        To safely test real order emails, use the test recipient and “Send test” controls in Message Automation. Sample previews never email customers.
      </p>
      <Link href="/lord/communications/automation" className="inline-flex text-sm font-bold text-amber-800 hover:underline">
        Configure and test order-status emails →
      </Link>
    </Card>
  );
}
