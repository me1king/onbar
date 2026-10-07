import { supabase } from '@/lib/supabaseClient';
import ProductDetailClient from '@/components/product/ProductDetailClient';
import { Metadata } from 'next';
import { Product } from '@/types/product';
import { getPublicBaseUrl, normalizeImage } from '@/lib/utils';
import { isStorefrontProductVisible } from '@/lib/productVisibility';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Dynamic SEO for Beverage Pages
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  let product: Product | null = null;

  if (supabase) {
    const { data } = await supabase
      .from('products')
      .select('name, description, image_url, image, images, image_gallery, price, hide_product, status, is_available_now')
      .eq('id', id)
      .single();
    product = data as unknown as Product;
  }

  // No Fallback
  if (!product || !isStorefrontProductVisible(product)) return { title: 'Product Not Found | Online Bar' };

  const productImages = Array.from(new Set([
    product.image || product.image_url,
    ...(product.images || []),
    ...(product.image_gallery || [])
  ].filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
    .map(image => normalizeImage(image)))).slice(0, 4);

  return {
    title: `${product.name} | Online Bar Nairobi`,
    description: product.description || `Buy authentic ${product.name} with Nairobi fast dispatch. Genuine products and premium service.`,
    openGraph: {
      title: product.name,
      description: product.description || undefined,
      images: productImages.length > 0 ? productImages : [normalizeImage(null)],
      type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: product.name,
        images: productImages.length > 0 ? productImages : [normalizeImage(null)],
    }
  };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const baseUrl = getPublicBaseUrl();

  let product: Product | null = null;
  let related: Product[] = [];
  let reviewStats = { count: 0, rating: 0 };

  if (supabase) {
    // 1. Fetch main product from DB
    const { data: dbProd } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
    product = dbProd as unknown as Product;

    if (dbProd) {
      // 2. Fetch real review stats
      const { data: revs } = await supabase
        .from('reviews')
        .select('rating')
        .eq('product_id', id)
        .eq('is_hidden', false);

      if (revs && revs.length > 0) {
        reviewStats = {
          count: revs.length,
          rating: Number((revs.reduce((s, r) => s + r.rating, 0) / revs.length).toFixed(1))
        };
      }
    }
  }

  // No Fallback

  if (!product || !isStorefrontProductVisible(product)) return (
    <div className="min-h-[50dvh] flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-2xl font-black uppercase text-foreground">Drink Not Found</h1>
        <p className="text-slate-500 mt-2">This item may have been removed from the catalog.</p>
    </div>
  );

  const productImages = Array.from(new Set([
    product.image || product.image_url,
    ...(product.images || []),
    ...(product.image_gallery || [])
  ].filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
    .map(image => normalizeImage(image)))).slice(0, 4);

  // 3. Fetch related products
  if (supabase) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('category', product.category || 'spirits')
      .neq('id', id)
      .limit(4);
    related = (data || []).filter(isStorefrontProductVisible).map((p) => ({
        ...(p as Record<string, unknown>),
        image_url: normalizeImage((p as Record<string, unknown>).image_url as string)
    })) as unknown as Product[];
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org/",
              "@type": "BreadcrumbList",
              "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": baseUrl },
                { "@type": "ListItem", "position": 2, "name": "Shop", "item": `${baseUrl}/shop` },
                { "@type": "ListItem", "position": 3, "name": product.name, "item": `${baseUrl}/shop/${id}` }
              ]
            },
            {
              "@context": "https://schema.org/",
              "@type": "Product",
              "name": product.name || 'Premium Selection',
              "image": productImages.length > 0 ? productImages : [normalizeImage(null)],
              "description": product.description || '',
              "brand": {
                "@type": "Brand",
                "name": "Online Bar Nairobi"
              },
              "offers": {
                "@type": "Offer",
                "priceCurrency": "KES",
                "price": product.price || 0,
                "availability": (product.stock || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                "url": `${baseUrl}/shop/${id}`,
                "priceValidUntil": "2027-12-31"
              },
              "aggregateRating": reviewStats.count > 0 ? {
                "@type": "AggregateRating",
                "ratingValue": reviewStats.rating,
                "reviewCount": reviewStats.count
              } : undefined
            }
          ])
        }}
      />
      <ProductDetailClient
          product={product}
          relatedProducts={related}
          reviewStats={reviewStats}
      />
    </>
  );
}
