'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Play, X } from 'lucide-react';

export type GuidedPanelTourStep = {
  selector: string;
  title: string;
  description: string;
  before?: () => void;
};

type GuidedPanelTourProps = {
  tourKey: string;
  title: string;
  steps: GuidedPanelTourStep[];
};

type TargetRect = { top: number; left: number; width: number; height: number };
type TooltipPosition = { top: number; left: number; below: boolean };

export default function GuidedPanelTour({ tourKey, title, steps }: GuidedPanelTourProps) {
  const [mounted, setMounted] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [targetRect, setTargetRect] = React.useState<TargetRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = React.useState<TooltipPosition | null>(null);
  const [targetUnavailable, setTargetUnavailable] = React.useState(false);
  const tooltipRef = React.useRef<HTMLElement>(null);
  const storageKey = `onbar-guided-tour:${tourKey}`;
  const currentStep = steps[stepIndex];

  const finishTour = React.useCallback(() => {
    try {
      localStorage.setItem(storageKey, 'completed');
    } catch (error) {
      console.warn('[GuidedPanelTour] Could not save tour progress:', error);
    }
    setActive(false);
  }, [storageKey]);

  React.useEffect(() => {
    setMounted(true);
    let timer: number | undefined;
    try {
      if (localStorage.getItem(storageKey) !== 'completed') {
        timer = window.setTimeout(() => setActive(true), 600);
      }
    } catch (error) {
      console.warn('[GuidedPanelTour] Could not read tour progress:', error);
      timer = window.setTimeout(() => setActive(true), 600);
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [storageKey]);

  React.useEffect(() => {
    if (!active || !currentStep) {
      setTargetRect(null);
      setTooltipPosition(null);
      setTargetUnavailable(false);
      return;
    }

    setTargetRect(null);
    setTooltipPosition(null);
    setTargetUnavailable(false);
    currentStep.before?.();
    let target: Element | null = null;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (!target) {
        target = document.querySelector(currentStep.selector);
        if (!target) {
          if (attempts >= 40) {
            window.clearInterval(timer);
            setTargetUnavailable(true);
          }
          return;
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }

      const rect = target.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        window.clearInterval(timer);
      } else if (attempts >= 40) {
        window.clearInterval(timer);
        setTargetUnavailable(true);
      }
    }, 100);

    const measureTarget = () => {
      const element = document.querySelector(currentStep.selector);
      if (!element) {
        setTargetRect(null);
        setTooltipPosition(null);
        return;
      }
      const rect = element.getBoundingClientRect();
      setTargetRect(rect.width > 0 && rect.height > 0
        ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        : null);
    };
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [active, currentStep]);

  React.useLayoutEffect(() => {
    if (!active || !targetRect || !tooltipRef.current) return;
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const below = window.innerHeight - (targetRect.top + targetRect.height) >= tooltip.height + 30;
    const left = Math.min(
      Math.max(12, targetRect.left + targetRect.width / 2 - tooltip.width / 2),
      Math.max(12, window.innerWidth - tooltip.width - 12)
    );
    const top = below
      ? targetRect.top + targetRect.height + 18
      : Math.max(12, targetRect.top - tooltip.height - 18);
    setTooltipPosition({ top, left, below });
  }, [active, targetRect, stepIndex]);

  React.useEffect(() => {
    if (active) tooltipRef.current?.focus();
  }, [active, stepIndex]);

  React.useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finishTour();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, finishTour]);

  function advance() {
    if (stepIndex >= steps.length - 1) finishTour();
    else setStepIndex(index => index + 1);
  }

  function startTour() {
    setStepIndex(0);
    setActive(true);
  }

  if (!steps.length) return null;

  return <>
    {!active && <button
      type="button"
      onClick={startTour}
      className="fixed bottom-5 right-5 z-[90] inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wide text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
    >
      <Play size={14} aria-hidden="true" /> Show me around
    </button>}
    {mounted && active && currentStep && createPortal(
      <>
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[9998]">
          {targetRect && <div
            className="absolute rounded-2xl border-2 border-amber-300 shadow-[0_0_0_9999px_rgba(2,6,23,0.78)] transition-all duration-300 motion-reduce:transition-none"
            style={{
              top: targetRect.top - 5,
              left: targetRect.left - 5,
              width: targetRect.width + 10,
              height: targetRect.height + 10
            }}
          />}
        </div>
        <section
          ref={tooltipRef}
          role="dialog"
          tabIndex={-1}
          aria-labelledby="guided-panel-tour-title"
          aria-describedby="guided-panel-tour-description"
          className="fixed z-[10000] max-h-[calc(100dvh-24px)] w-[min(360px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-amber-300/50 bg-slate-950 p-5 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none"
          style={tooltipPosition
            ? { top: tooltipPosition.top, left: tooltipPosition.left }
            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          {tooltipPosition?.below
            ? <ArrowUp aria-hidden="true" className="absolute -top-9 left-1/2 h-7 w-7 -translate-x-1/2 animate-bounce text-amber-300 motion-reduce:animate-none" />
            : <ArrowDown aria-hidden="true" className="absolute -bottom-9 left-1/2 h-7 w-7 -translate-x-1/2 animate-bounce text-amber-300 motion-reduce:animate-none" />}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">{title} · Step {stepIndex + 1} of {steps.length}</p>
              <h2 id="guided-panel-tour-title" className="mt-2 text-lg font-black">{currentStep.title}</h2>
            </div>
            <button type="button" onClick={finishTour} aria-label="Close tour" className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <p id="guided-panel-tour-description" className="mt-3 text-sm leading-6 text-white/75">{currentStep.description}</p>
          {targetUnavailable && <p role="status" className="mt-3 text-xs text-amber-200">This control is not visible right now. You can still continue the tour.</p>}
          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" onClick={finishTour} className="text-xs font-bold text-white/55 underline-offset-4 hover:text-white hover:underline">Skip tour</button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStepIndex(index => Math.max(0, index - 1))}
                disabled={stepIndex === 0}
                aria-label="Previous tour step"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-white disabled:opacity-30"
              >
                <ChevronLeft size={17} />
              </button>
              <button type="button" onClick={advance} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-300 px-4 text-xs font-black uppercase text-slate-950 transition hover:bg-amber-200">
                {stepIndex === steps.length - 1 ? 'Finish' : 'Next'} {stepIndex < steps.length - 1 && <ChevronRight size={15} />}
              </button>
            </div>
          </div>
        </section>
      </>,
      document.body
    )}
  </>;
}
