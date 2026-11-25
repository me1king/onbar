'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home,
    Search,
    Cookie,
    User,
    Flame,
    Wine,
    Gift,
    Utensils,
    Gamepad2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart } from '@/context/CartContext';

const NAV_ITEMS = [
    { label: 'Home', icon: Home, href: '/' },
    { label: 'Shop', icon: Search, href: '/shop' },
    { label: 'Drinks', icon: Wine, href: '/beverages' },
    { label: 'Food', icon: Utensils, href: '/bites' },
    { label: 'Souvenirs', icon: Gift, href: '/souvenirs' },
    { label: 'Build Night', icon: Flame, href: '/build-the-night' },
    { label: 'Game Night', icon: Gamepad2, href: '/games' },
    { label: 'Munchies', icon: Cookie, href: '/shop/snacks' },
    { label: 'My Bar', icon: User, href: '/profile' }
];

export default function MobileBottomNav() {
    const pathname = usePathname();
    const { cart } = useCart();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Only show on mobile, and hide on admin pages
    if (pathname?.startsWith('/lord')
        || pathname?.startsWith('/market')
        || pathname === '/merchant/register'
        || pathname?.startsWith('/merchant/dashboard')
        || pathname?.startsWith('/merchant/portal')) return null;

    return (
        <nav data-mobile-bottom-nav className="fixed bottom-0 left-0 right-0 z-[1000] lg:hidden bg-white/95 backdrop-blur-xl border-t border-slate-100 pb-safe animate-in slide-in-from-bottom-full duration-500">
            <div className="flex justify-around items-center h-20 px-1 sm:px-4">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || (item.href === '/games' && pathname?.startsWith('/games/'));

                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className="relative flex min-w-0 flex-col items-center justify-center w-full h-full group"
                        >
                            <div className={cn(
                                "flex flex-col items-center gap-1 transition-all duration-300 min-w-0 px-1",
                                isActive ? "text-primary scale-110" : "text-slate-400 group-active:scale-95"
                            )}>
                                <div className="relative shrink-0">
                                    <Icon className={cn("h-5 w-5 sm:h-6 sm:w-6", isActive && "fill-current")} />
                                    {item.label === 'Orders' && (
                                        <div className="absolute -top-1 -right-1 h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
                                    )}
                                </div>
                                <span className={cn(
                                    "w-full text-center font-black uppercase tracking-[0.02em] sm:text-[10px] sm:tracking-normal",
                                    item.href === '/games' ? "whitespace-normal break-words text-[6px] leading-[7px] sm:leading-normal" : "truncate text-[7px]"
                                )}>{item.label}</span>
                            </div>

                            {/* Active Indicator Bar */}
                            {isActive && (
                                <div className="absolute top-0 h-1 w-8 bg-primary rounded-b-full shadow-[0_4px_10px_rgba(245,160,0,0.4)]" />
                            )}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
