const isPackagedBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "1";

function queryRoute(pathname: string, id: string, search = "") {
  const params = new URLSearchParams(search);
  params.set("id", id);
  return `${pathname}?${params.toString()}`;
}

export function productHref(id: string) {
  return isPackagedBuild ? queryRoute("/product", id) : `/shop/${id}`;
}

export function orderHref(id: string, search = "") {
  return isPackagedBuild ? queryRoute("/order", id, search) : `/orders/${id}${search ? `?${search}` : ""}`;
}

export function sellerOrderHref(id: string) {
  return isPackagedBuild ? queryRoute("/seller-order", id) : `/seller/orders/${id}`;
}
