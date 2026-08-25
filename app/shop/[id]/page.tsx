import { notFound } from "next/navigation";
import { ProductPage } from "@/components/partx/product-page";
import { getProduct } from "@/lib/demo-data";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) notFound();
  return <ProductPage product={product} />;
}
