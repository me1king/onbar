export interface Product {
  id: number;
  name: string;
  price: number;
  old_price?: number;
  cost_price?: number;
  image?: string;
  image_url?: string;
  images?: string[];
  image_gallery?: string[];
  description?: string;
  category?: string;
  sub_category?: string; // NEW
  rating?: number;
  is_new?: boolean;
  is_featured?: boolean;
  is_on_offer?: boolean;
  min_loyalty_tier?: string;
  order_count?: number;
  wholesale_price?: number;
  wholesale_min_qty?: number;
  stock?: number;
  sizes?: string[];
  variant_stock?: Record<string, number>;
  variant_prices?: Record<string, number>;
  beverage_specs?: {
    sensory_dna?: {
        body: number;
        sweetness: number;
        oak: number;
        smoke: number;
        intensity: number;
    };
    perfect_serve?: {
        mixer_id?: number;
        glassware?: string;
    };
    abv?: string;
    origin?: string;
    region?: string;
    body?: string;
    sweetness?: string;
    glassware?: string;
    model_3d_url?: string;
  };

  // High-Fidelity Micro-Details
  brand?: string;
  origin?: string;
  region?: string;
  body?: string;
  sweetness?: string;
  size_label?: string;
  abv_label?: string;
  manufacturer?: string;
  ingredients?: string[];
  specifications?: Array<{ key: string, value: string }>;
  stock_threshold_low?: number;
  stock_threshold_critical?: number;
  restock_date?: string;
  badge_override?: string;
  display_priority?: number;
  sensory_metrics?: Record<string, number>;
  pairing_suggestions?: string[];
  bought_together_ids?: number[];
  faq_data?: Array<{ q: string, a: string }>;
  bundle_product_id?: number; // LEGACY support
  bundle_discount_percent?: number; // LEGACY support

  // Bite Command Props
  is_bite?: boolean;
  is_snack?: boolean;
  prep_time?: number;
  is_available_now?: boolean;
  operating_hours?: { start: string; end: string };
}
