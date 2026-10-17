import { supabase } from '@/lib/supabaseClient';
import { Product } from '@/types/product';
import BeverageCommandPage from '@/app/beverages/page';
import CategoryCatalog from './CategoryCatalog';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import { isSpiritProductCategory, spiritCategoryPostgrestFilter } from '@/lib/productCategories';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug = '' } = await params;
  const categorySlug = slug.toLowerCase();

  if (categorySlug === 'beverages') {
    return <BeverageCommandPage />;
  }

  let products: Product[] = [];
  let fetchError: string | null = null;

  if (!supabase) {
    fetchError = 'Product catalogue is not configured.';
  } else if (categorySlug) {
    try {
      let query = supabase.from('products').select('*');

      if (categorySlug === 'new-arrivals') {
        query = query.or('is_new.eq.true,is_featured.eq.true');
      } else if (categorySlug === 'sale') {
        query = query.or('is_on_offer.eq.true,old_price.not.is.null,category.eq.sale,category.eq.deals');
      } else if (categorySlug === 'featured') {
        query = query.eq('is_featured', true);
      } else if (categorySlug === 'gifts') {
        query = query.or('is_souvenir.eq.true,category.ilike.%gift%,category.ilike.%souvenir%,sub_category.ilike.%gift%');
      } else if (categorySlug === 'spirits') {
        query = query.or(spiritCategoryPostgrestFilter());
      } else {
        query = query.ilike('category', `%${categorySlug}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        console.error('Could not load category catalogue:', error);
        fetchError = 'Could not load products. Please try again later.';
      } else {
        products = ((data || []) as Product[]).filter(product =>
          isStorefrontProductVisible(product)
          && (categorySlug !== 'spirits' || isSpiritProductCategory(product.category))
        );
      }
    } catch (error) {
      console.error('Could not load category catalogue:', error);
      fetchError = 'Could not load products. Please try again later.';
    }
  }

  const displayTitle = categorySlug
    ? categorySlug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    : 'Drinks';

  return <CategoryCatalog title={displayTitle} products={products} error={fetchError} />;
}
