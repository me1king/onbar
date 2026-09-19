'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldAlert, RefreshCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[APEX_OS] Sub-Node Exception:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="py-20 px-6 bg-slate-50/50 rounded-[3rem] border border-slate-100 text-center animate-in fade-in duration-700">
          <div className="max-w-md mx-auto space-y-6">
            <div className="h-16 w-16 bg-white border-2 border-primary/20 rounded-2xl flex items-center justify-center text-primary mx-auto shadow-sm">
                <ShieldAlert size={32} />
            </div>
            <div className="space-y-1">
                <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Node Sync Interrupted</h3>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest italic">Local interface error detected</p>
            </div>
            <p className="text-xs font-medium text-slate-500 leading-relaxed italic px-4">
                &quot;A component in this section failed to render correctly. This will not affect your orders.&quot;
            </p>
            <Button
                onClick={() => this.setState({ hasError: false })}
                className="h-12 px-8 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/10 active:scale-95 transition-all"
            >
                <RefreshCcw className="mr-2 h-4 w-4" /> Reset Section
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
