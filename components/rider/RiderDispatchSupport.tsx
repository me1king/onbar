'use client';

import { MessageCircle } from 'lucide-react';
import { useSettings } from '@/lib/useSettings';
import { getKenyanWhatsAppNumber } from '@/lib/riderContact';

export default function RiderDispatchSupport() {
  const { settings } = useSettings();
  const number = getKenyanWhatsAppNumber(settings.contact.whatsapp || '');
  const message = encodeURIComponent('Hi dispatch, I need help with my rider account or shift.');
  if (!/^254[17]\d{8}$/.test(number)) return null;

  return (
    <a
      href={`https://wa.me/${number}?text=${message}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Contact rider dispatch on WhatsApp"
      className="fixed bottom-5 right-5 z-[1500] inline-flex h-12 items-center gap-2 rounded-full bg-emerald-700 px-5 text-sm font-bold text-white shadow-lg transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
    >
      <MessageCircle className="h-4 w-4" />
      Dispatch support
    </a>
  );
}
