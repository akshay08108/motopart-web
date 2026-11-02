import type { Product } from "./types";

export function normalizePartSearch(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function scorePartSearch(product: Product, query: string): number {
  const term = normalizePartSearch(query);
  if (!term) return 1;
  const name = normalizePartSearch(product.name);
  const number = normalizePartSearch(`${product.partNumber} ${product.oemNumber} ${product.barcode ?? ""}`);
  const text = normalizePartSearch(`${product.name} ${product.brand} ${product.partNumber} ${product.oemNumber} ${product.barcode ?? ""} ${product.category} ${product.seller}`);
  const compact = (value: string) => value.replaceAll(" ", "");
  const tokens = term.split(" ");
  if (!text.includes(term) && !compact(text).includes(compact(term)) && !tokens.every((token) => text.includes(token))) return 0;
  return (compact(number).includes(compact(term)) ? 100 : 0)
    + (name === term ? 90 : name.startsWith(term) ? 65 : name.includes(term) ? 45 : compact(name).includes(compact(term)) ? 35 : 15)
    + (normalizePartSearch(product.category).includes(term) ? 10 : 0);
}

export function searchParts(catalog: Product[], query: string) {
  return catalog.map((product, index) => ({ product, index, score: scorePartSearch(product, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ product }) => product);
}
