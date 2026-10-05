import WidgetRegistry from "@/components/widgets/WidgetRegistry";
import NeuralHero from "@/components/home/hero/NeuralHero";
import ProductList from "@/components/home/ProductList";

export const revalidate = 300; // Shared with cache

export default async function Home() {
  return (
    <div className="bg-white min-h-screen text-left pb-20">
      <NeuralHero />
      <section id="catalog-section" className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-20">
        <ProductList />
      </section>
      <WidgetRegistry pageRoute="/" coreWidgetsRendered />
    </div>
  );
}
