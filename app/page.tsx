import { Storefront } from "@/components/storefront";
import { getDemoCatalog, vehicles } from "@/lib/demo-data";

export default function HomePage() {
  return <Storefront initialProducts={getDemoCatalog()} initialVehicles={vehicles} />;
}
