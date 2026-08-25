import { CatalogProductPage } from "@/components/partx/product-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CatalogProductPage id={id} />;
}
