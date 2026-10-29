"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { OB_OS } from "@/lib/onlineBarOS";
import { supabase } from "@/lib/supabaseClient";
import { Product } from "@/types/product";

export interface EngravingCustomization {
  text: string;
  font: 'classic' | 'modern' | 'signature';
  finish: 'matte_black' | 'brushed_steel';
  giftPackage: boolean;
  giftMessage: string | null;
  spellingApproved: true;
}

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
  engraving?: EngravingCustomization;
  engraving_fee?: number;
  gift_packaging_fee?: number;
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
  const engraving = item.engraving ? JSON.stringify(item.engraving) : '';
  return `${item.id}:${item.size || 'Standard'}:${addonIds}:${engraving}`;
}

function getUnitPrice(item: CartItem, quantity: number) {
  const basePrice = item.wholesale_price && item.wholesale_min_qty && quantity >= item.wholesale_min_qty
    ? item.wholesale_price
    : item.base_price ?? item.price;
  const addonPrice = (item.addons || []).reduce((sum, addon) => sum + addon.price, 0);
  const customizationPrice = Number(item.engraving_fee || 0) + Number(item.gift_packaging_fee || 0);
  return basePrice + addonPrice + customizationPrice;
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
              return { ...cartItem, cart_key: cartKey, quantity: newQty, price: getUnitPrice(cartItem, newQty) };
          }
          return cartItem;
        });
      }

      const qty = item.quantity || 1;
      return [...prevCart, {
        ...item,
        cart_key: cartKey,
        base_price: item.base_price ?? item.price,
        price: getUnitPrice(item, qty),
        quantity: qty
      }];
    });
  };

  const addBundleToCart = (items: CartItem[]) => {
    setCart((prevCart) => {
      let newCart = [...prevCart];
      items.forEach(item => {
          const quantity = Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
          const cartKey = getCartKey(item);
          const existingIndex = newCart.findIndex(c => getCartKey(c) === cartKey);
          if (existingIndex >= 0) {
              newCart = newCart.map((cartItem, index) => {
                if (index !== existingIndex) return cartItem;
                const nextQuantity = cartItem.quantity + quantity;
                return { ...cartItem, quantity: nextQuantity, price: getUnitPrice(cartItem, nextQuantity) };
              });
          } else {
              newCart.push({
                ...item,
                cart_key: cartKey,
                base_price: item.base_price ?? item.price,
                quantity,
                price: getUnitPrice(item, quantity)
              });
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
            return { ...item, quantity: newQty, price: getUnitPrice(item, newQty) };
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
