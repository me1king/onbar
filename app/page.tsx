import WidgetRegistry from "@/components/widgets/WidgetRegistry";
import NeuralHero from "@/components/home/hero/NeuralHero";
import ProductList from "@/components/home/ProductList";

export const revalidate = 300; // Shared with cache

export default async function Home() {
  return (
    <div className="bg-white min-h-screen text-left pb-20">
      <NeuralHero />
      <section id="catalog-section" className="mx-auto w-full px-3 sm:px-6 lg:px-8">
        <ProductList />
      </section>
      <WidgetRegistry pageRoute="/" coreWidgetsRendered />
    </div>
  );
}
