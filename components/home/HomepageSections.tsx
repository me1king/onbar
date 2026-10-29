'use client';

import NeuralHero from '@/components/home/hero/NeuralHero';
import ProductList from '@/components/home/ProductList';
import WidgetRegistry from '@/components/widgets/WidgetRegistry';
import { useSettings } from '@/lib/useSettings';

export default function HomepageSections() {
    const { settings } = useSettings();
    const homepage = settings.homepage;

    return (
        <div className="bg-white min-h-screen text-left pb-20">
            {homepage.show_hero !== false && <NeuralHero />}
            {homepage.show_catalog !== false && (
                <section id="catalog-section" className="mx-auto w-full px-3 sm:px-6 lg:px-8">
                    <ProductList
                        kicker={homepage.catalog_kicker}
                        title={homepage.catalog_title}
                        subtitle={homepage.catalog_subtitle}
                        categoryFilters={settings.catalog.categories}
                    />
                </section>
            )}
            {homepage.show_widgets !== false && <WidgetRegistry pageRoute="/" coreWidgetsRendered />}
        </div>
    );
}
