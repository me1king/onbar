"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { OB_OS } from "@/lib/onlineBarOS";
import { supabase } from "@/lib/supabaseClient";
import { Product } from "@/types/product";

export interface CartItem {
  id: number;
  name: string;
  price: number;
  base_price: number;
  image: string;
  quantity: number;
  category?: string;
  size?: string;
  wholesale_price?: number;
  wholesale_min_qty?: number;
  addons?: Array<{ id: string; name: string; price: number }>;
  cart_key?: string;
}

interface CartContextProps {
  cart: CartItem[];
  compareList: Product[];
  addToCart: (item: CartItem) => void;
  addBundleToCart: (items: CartItem[]) => void;
  toggleCompare: (item: Product) => void;
  removeFromCart: (id: number, cartKey?: string) => void;
  clearCart: () => void;
  updateQuantity: (id: number, quantity: number, cartKey?: string) => void;
}

function getCartKey(item: CartItem) {
  const addonIds = (item.addons || []).map(addon => addon.id).sort().join(',');
  return `${item.id}:${item.size || 'Standard'}:${addonIds}`;
}

const CartContext = createContext<CartContextProps | undefined>(undefined);

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [compareList, setCompareList] = useState<Product[]>([]);

  useEffect(() => {
    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.warn("[OB_OS] Cart parse failed. Resetting node...", e);
        localStorage.removeItem("cart");
        setCart([]);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  const addToCart = async (item: CartItem) => {
    // Meta Tracking
    const win = window as unknown as Window & { fbq?: (...args: unknown[]) => void };
    if (typeof window !== 'undefined' && win.fbq) {
        win.fbq('track', 'AddToCart', {
            content_name: item.name,
            content_ids: [item.id],
            content_type: 'product',
            value: item.price,
            currency: 'KES'
        });
    }

    const { data: { session } } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const anonId = localStorage.getItem('ob_anonymous_id');
    void OB_OS.track('ADD_TO_CART', {
      userId: session?.user?.id,
      anonymousId: anonId || undefined,
      productId: item.id,
      amount: item.price,
      details: { name: item.name, category: item.category, size: item.size, addons: item.addons?.map(addon => addon.name) || [] }
    });

    setCart((prevCart) => {
      const cartKey = getCartKey(item);
      const existingItem = prevCart.find((cartItem) => getCartKey(cartItem) === cartKey);

      if (existingItem) {
        return prevCart.map((cartItem) => {
          if (getCartKey(cartItem) === cartKey) {
              const newQty = cartItem.quantity + (item.quantity || 1);
              let basePrice = cartItem.base_price;

              if (cartItem.wholesale_price && cartItem.wholesale_min_qty && newQty >= cartItem.wholesale_min_qty) {
                  basePrice = cartItem.wholesale_price;
              }

              const addonPrice = (cartItem.addons || []).reduce((sum, addon) => sum + addon.price, 0);
              return { ...cartItem, cart_key: cartKey, quantity: newQty, price: basePrice + addonPrice };
          }
          return cartItem;
        });
      }

      let initialPrice = (item.base_price ?? item.price) + (item.addons || []).reduce((sum, addon) => sum + addon.price, 0);
      const qty = item.quantity || 1;
      if (item.wholesale_price && item.wholesale_min_qty && qty >= item.wholesale_min_qty) {
          initialPrice = item.wholesale_price + (item.addons || []).reduce((sum, addon) => sum + addon.price, 0);
      }

      return [...prevCart, { ...item, cart_key: cartKey, base_price: item.base_price ?? item.price, price: initialPrice, quantity: qty }];
    });
  };

  const addBundleToCart = (items: CartItem[]) => {
    setCart((prevCart) => {
      let newCart = [...prevCart];
      items.forEach(item => {
          const cartKey = getCartKey(item);
          const existingItem = newCart.find(c => getCartKey(c) === cartKey);
          if (existingItem) {
              newCart = newCart.map(c => getCartKey(c) === cartKey ? { ...c, quantity: c.quantity + 1 } : c);
          } else {
              newCart.push({ ...item, cart_key: cartKey, quantity: 1 });
          }
      });
      return newCart;
    });
  };

  const removeFromCart = (id: number, cartKey?: string) => {
    setCart((prevCart) => prevCart.filter((item) => cartKey ? getCartKey(item) !== cartKey : item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    localStorage.removeItem("cart");
  };

  const updateQuantity = (id: number, quantity: number, cartKey?: string) => {
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (cartKey ? getCartKey(item) === cartKey : item.id === id) {
            const newQty = Math.max(1, quantity);
            let basePrice = item.base_price;

            if (item.wholesale_price && item.wholesale_min_qty && newQty >= item.wholesale_min_qty) {
                basePrice = item.wholesale_price;
            }

            const addonPrice = (item.addons || []).reduce((sum, addon) => sum + addon.price, 0);
            return { ...item, quantity: newQty, price: basePrice + addonPrice };
        }
        return item;
      })
    );
  };

  const toggleCompare = (item: Product) => {
      setCompareList(prev => {
          const exists = prev.find(p => p.id === item.id);
          if (exists) return prev.filter(p => p.id !== item.id);
          if (prev.length >= 2) return [prev[1], item]; // Max 2 items
          return [...prev, item];
      });
  };

  return (
    <CartContext.Provider
      value={{ cart, compareList, addToCart, addBundleToCart, toggleCompare, removeFromCart, clearCart, updateQuantity }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
