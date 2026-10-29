"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/context/CartContext";
import { formatPrice, normalizeImage } from "@/lib/utils";
import { Minus, Plus, Trash2 } from "lucide-react";
import DecodedImage from "@/components/ui/DecodedImage";

interface CartItemProps {
  item: {
    id: number;
    name: string;
    price: number;
    base_price?: number;
    image: string;
    quantity: number;
    size?: string;
    cart_key?: string;
    engraving_fee?: number;
    gift_packaging_fee?: number;
    addons?: Array<{ id: string; name: string; price: number }>;
    engraving?: {
      text: string;
      font: 'classic' | 'modern' | 'signature';
      finish: 'matte_black' | 'brushed_steel';
      giftPackage: boolean;
      giftMessage: string | null;
      spellingApproved: true;
    };
  };
  isLast: boolean;
}

export default function CartItem({ item, isLast }: CartItemProps) {
  const { removeFromCart, updateQuantity } = useCart();

  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="relative w-[100px] h-[100px]">
          <DecodedImage
            src={normalizeImage(item.image)}
            alt={item.name}
            fill
            sizes="100px"
            className="rounded-lg object-cover bg-muted"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-4">
              <h2 className="font-semibold text-foreground line-clamp-2">
                {item.name}
              </h2>
              {item.size && <p className="text-xs text-muted-foreground mt-1">{item.size}</p>}
              {item.engraving && (
                <div className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
                  <p>
                    Engraving: “{item.engraving.text}” · {item.engraving.font} · {item.engraving.finish === 'matte_black' ? 'Matte black' : 'Brushed steel'}
                    {item.engraving.giftPackage ? ' · Gift packaging' : ''}
                  </p>
                  <p>
                    Engraving {formatPrice(item.engraving_fee || 0)}
                    {item.engraving.giftPackage ? ` · Gift packaging ${formatPrice(item.gift_packaging_fee || 0)}` : ''}
                  </p>
                  {item.engraving.giftMessage && <p className="whitespace-pre-wrap">Gift message: {item.engraving.giftMessage}</p>}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                {formatPrice(item.price)} each
              </p>
              {item.addons && item.addons.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Extras: {item.addons.map(addon => addon.name).join(', ')}
                </p>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeFromCart(item.id, item.cart_key)}
              className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center border border-border rounded-lg">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  updateQuantity(item.id, Math.max(1, item.quantity - 1), item.cart_key)
                }
                disabled={item.quantity <= 1}
                className="h-8 w-8 rounded-r-none"
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="px-4 py-2 min-w-[50px] text-center text-sm font-medium">
                {item.quantity}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => updateQuantity(item.id, item.quantity + 1, item.cart_key)}
                className="h-8 w-8 rounded-l-none"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            <div className="text-right">
              <p className="text-lg font-bold text-foreground">
                {formatPrice(item.price * item.quantity)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {!isLast && <Separator className="mt-4" />}
    </div>
  );
}
