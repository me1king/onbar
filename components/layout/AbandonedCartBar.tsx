'use client';

import { useState, useEffect } from 'react';
import { ShoppingBag, X, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '../ui/button';
import { useCart } from '@/context/CartContext';
import { useRouter } from 'next/navigation';

export default function AbandonedCartBar() {
    const { cart, replaceCart } = useCart();
    const router = useRouter();
    const [savedItems, setSavedItems] = useState<unknown>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        async function checkAbandonedCart() {
            if (!supabase || cart.length > 0) return;
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                console.error('[AbandonedCart] Could not read customer session:', error);
                return;
            }
            if (!session) return;

            const response = await fetch('/api/customer/abandoned-cart', {
                headers: { Authorization: `Bearer ${session.access_token}` },
                cache: 'no-store'
            });
            const result = await response.json() as { cart?: { cart_items?: unknown } | null; error?: string };
            if (!response.ok) throw new Error(result.error || 'Saved cart could not be loaded.');
            if (result.cart?.cart_items) {
                setSavedItems(result.cart.cart_items);
                setIsVisible(true);
            }
        }
        void checkAbandonedCart().catch(error => {
            console.error('[AbandonedCart] Could not load saved cart:', error);
        });
    }, [cart.length]);

    if (!isVisible || !savedItems || cart.length > 0) return null;

    const restoreSavedCart = () => {
        setIsRestoring(true);
        setErrorMessage(null);
        if (!replaceCart(savedItems)) {
            setErrorMessage('These saved items could not be restored. Please browse and add them again.');
            setIsRestoring(false);
            return;
        }
        router.push('/cart');
    };

    return (
        <div className="bg-primary text-white py-3 px-4 shadow-lg animate-in slide-in-from-top duration-500">
            <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                        <ShoppingBag className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest">
                        Welcome back! We&apos;ve saved your items.
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        {errorMessage && <p role="alert" className="text-xs font-semibold">{errorMessage}</p>}
                        <Button onClick={restoreSavedCart} disabled={isRestoring} className="h-9 px-6 bg-white text-primary hover:bg-slate-50 font-black uppercase text-[10px] tracking-widest rounded-xl">
                            {isRestoring ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                            Restore saved cart <ArrowRight className="ml-2 h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <button
                        onClick={() => setIsVisible(false)}
                        className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
