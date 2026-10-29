import HomepageSections from "@/components/home/HomepageSections";

export const revalidate = 300; // Shared with cache

export default async function Home() {
  return <HomepageSections />;
}
