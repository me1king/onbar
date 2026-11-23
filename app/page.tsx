import HomepageSections from "@/components/home/HomepageSections";
import { createServerSupabaseClient } from "@/lib/serverSupabase";
import { isStorefrontProductVisible } from "@/lib/productVisibility";
import type { Product } from "@/types/product";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabaseClient";

export const revalidate = 300; // Shared with cache
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const homepageProductColumns = 'id,name,price,old_price,description,short_description,image_url,images,sizes,size_label,category,sub_category,brand,stock,variant_stock,variant_prices,status,hide_product,is_available_now,is_featured,is_bite,is_snack,is_souvenir,material,finish,capacity_ml,capacity_oz,weight_grams,story,drink_pairings,created_at,pairing_suggestions,bought_together_ids,engraving_enabled,engraving_fee,gift_packaging_fee';
const legacyHomepageProductColumns = 'id,name,price,old_price,description,short_description,image_url,images,sizes,size_label,category,sub_category,brand,stock,variant_stock,variant_prices,status,hide_product,is_available_now,is_featured,is_bite,is_snack,is_souvenir,material,finish,capacity_oz,weight_grams,story,drink_pairings,created_at,pairing_suggestions,bought_together_ids';

async function loadHomepageProducts(): Promise<Product[]> {
  const database = createServerSupabaseClient() || supabase;
  if (!database) {
    console.error('[Home] Server-side product catalog is not configured.');
    return [];
  }

  let { data, error } = await database.from('products')
    .select(homepageProductColumns)
    .or('hide_product.is.null,hide_product.eq.false')
    .or('is_available_now.is.null,is_available_now.eq.true')
    .or('status.is.null,status.not.in.(draft,hidden,inactive,archived,deleted)')
    .order('created_at', { ascending: false })
    .limit(100)
    .abortSignal(AbortSignal.timeout(8_000))
    .returns<Product[]>();
  const missingOptionalColumns = Boolean(error
    && ['42703', 'PGRST204'].includes(error.code || '')
    && /capacity_ml|engraving_enabled|engraving_fee|gift_packaging_fee/i.test(error.message));

  if (missingOptionalColumns) {
    ({ data, error } = await database.from('products')
      .select(legacyHomepageProductColumns)
      .or('hide_product.is.null,hide_product.eq.false')
      .or('is_available_now.is.null,is_available_now.eq.true')
      .or('status.is.null,status.not.in.(draft,hidden,inactive,archived,deleted)')
      .order('created_at', { ascending: false })
      .limit(100)
      .abortSignal(AbortSignal.timeout(8_000))
      .returns<Product[]>());
  }

  if (error) {
    console.error('[Home] Server-side product catalog could not be loaded:', error.message);
    return [];
  }

  return (data || [])
    .filter(isStorefrontProductVisible)
    .map(product => ({
      ...product,
      price: Number(product.price),
      stock: Number(product.stock || 0),
      image_url: product.image_url || ''
    }));
}

export default async function Home() {
  const products = await loadHomepageProducts();
  return <HomepageSections initialProducts={products} />;
}
