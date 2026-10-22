'use client';

import { useRef, useState } from 'react';
import { Check, LoaderCircle, Printer, ReceiptText, Sparkles, X } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';

type ReceiptPrintButtonProps = {
  orderId: string | number;
  total: number;
  paymentMethod: string;
  status: string;
  onPrint: () => Promise<void> | void;
  className?: string;
  iconOnly?: boolean;
  disabled?: boolean;
};

export default function ReceiptPrintButton({
  orderId,
  total,
  paymentMethod,
  status,
  onPrint,
  className,
  iconOnly = false,
  disabled = false
}: ReceiptPrintButtonProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPrinting = async () => {
    if (isPrinting || disabled) return;
    setError('');
    setIsComplete(false);
    setIsPrinting(true);
    try {
      await new Promise<void>((resolve) => {
        timer.current = setTimeout(resolve, 1450);
      });
      await onPrint();
      setIsComplete(true);
      timer.current = setTimeout(() => {
        setIsPrinting(false);
        setIsComplete(false);
      }, 1150);
    } catch (printError) {
      console.error('[ReceiptPrint] Could not prepare receipt:', printError);
      setError(printError instanceof Error ? printError.message : 'The receipt could not be printed.');
      setIsPrinting(false);
    }
  };

  const closeAnimation = () => {
    if (timer.current) clearTimeout(timer.current);
    setIsPrinting(false);
    setIsComplete(false);
    setError('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void startPrinting()}
        disabled={disabled || isPrinting}
        aria-label={iconOnly ? `Print receipt for order ${orderId}` : undefined}
        className={cn(
          iconOnly
            ? 'inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-primary hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50'
            : 'inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        <Printer className="h-4 w-4" />
        {!iconOnly && <span>Print receipt</span>}
      </button>

      {(isPrinting || error) && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-print-title"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/70 bg-[#fffdf9] p-6 text-center shadow-[0_32px_100px_rgba(0,0,0,0.35)] sm:p-8">
            <button
              type="button"
              aria-label="Close receipt animation"
              onClick={closeAnimation}
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>

            {error ? (
              <>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                  <ReceiptText className="h-7 w-7" />
                </div>
                <h2 id="receipt-print-title" className="text-lg font-black uppercase tracking-tight text-slate-950">Receipt not ready</h2>
                <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>
                <button type="button" onClick={closeAnimation} className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white">
                  Close
                </button>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  {isComplete ? <Check className="h-7 w-7" /> : <Printer className="h-7 w-7 animate-pulse" />}
                </div>
                <h2 id="receipt-print-title" className="text-lg font-black uppercase tracking-tight text-slate-950">
                  {isComplete ? 'Receipt ready' : 'Printing your receipt'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {isComplete ? 'Your receipt has been prepared successfully.' : 'Preparing a clear payment record for your order…'}
                </p>

                <div className="receipt-printer mx-auto mt-7 w-full max-w-[260px]">
                  <div className="relative z-10 mx-auto flex h-12 w-48 items-center justify-center rounded-t-2xl bg-slate-900 shadow-lg">
                    <span className="h-2 w-20 rounded-full bg-slate-600" />
                    <span className="absolute -bottom-1 left-1/2 h-2 w-24 -translate-x-1/2 rounded-full bg-primary" />
                  </div>
                  <div className="relative mx-auto -mt-1 w-40 overflow-hidden">
                    <div className={cn(
                      'receipt-paper relative mx-auto rounded-b-lg bg-white px-4 pb-4 pt-3 text-left shadow-md ring-1 ring-slate-200',
                      isComplete && 'receipt-paper-done'
                    )}>
                      <div className="mb-2 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-primary">
                        <span>Online Bar</span>
                        <Sparkles className="h-3 w-3" />
                      </div>
                      <div className="space-y-1 border-y border-dashed border-slate-200 py-2 text-[9px] text-slate-500">
                        <div className="flex justify-between"><span>Order</span><span className="font-bold text-slate-800">#{orderId}</span></div>
                        <div className="flex justify-between"><span>Payment</span><span className="max-w-20 truncate font-bold text-slate-800">{paymentMethod || 'Order payment'}</span></div>
                        <div className="flex justify-between"><span>Status</span><span className="font-bold text-slate-800">{status}</span></div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] font-black text-slate-950">
                        <span>Total</span><span>{formatPrice(total)}</span>
                      </div>
                      <div className="mt-2 flex justify-center gap-1 opacity-40" aria-hidden="true">
                        {Array.from({ length: 20 }).map((_, index) => (
                          <span key={index} className={cn('h-5 bg-slate-900', index % 4 === 0 ? 'w-1' : 'w-0.5')} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mx-auto h-5 w-56 rounded-b-2xl bg-gradient-to-b from-slate-300 to-slate-400 shadow-md" />
                </div>
                <div className="mx-auto mt-6 h-1.5 w-full max-w-[260px] overflow-hidden rounded-full bg-slate-100">
                  <div className={cn('h-full rounded-full bg-primary', isComplete ? 'w-full transition-[width] duration-300' : 'receipt-progress')} />
                </div>
                <p aria-live="polite" className="mt-3 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {!isComplete && <LoaderCircle className="h-3 w-3 animate-spin" />}
                  {isComplete ? 'Ready to keep or share' : 'Securing your payment details'}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
