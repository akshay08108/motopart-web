"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { usePartX } from "./app-provider";
import { ProductCard } from "./product-card";

const preferredCategories = ["Brakes", "Filters", "Batteries", "Engine", "Electrical", "Suspension", "Accessories", "Other"];

export function ShopPage() {
  const params = useSearchParams();
  const initialCategory = params.get("category") ?? "All";
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState("recommended");
  const { vehicles, activeVehicleId, catalog } = usePartX();
  const categories = useMemo(() => ["All", ...preferredCategories.filter((item) => catalog.some((product) => product.category === item)), ...[...new Set(catalog.map((product) => product.category))].filter((item) => !preferredCategories.includes(item))], [catalog]);
  const [category, setCategory] = useState(initialCategory);
  const activeCategory = categories.includes(category) ? category : "All";
  const vehicle = vehicles.find((item) => item.id === activeVehicleId);
  const products = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    const compactQuery = normalizedQuery.replaceAll(" ", "");
    const list = catalog.filter((product) => {
      const matchesCategory = activeCategory === "All" || product.category === activeCategory;
      const haystack = normalizeSearch(`${product.name} ${product.brand} ${product.partNumber} ${product.oemNumber} ${product.barcode ?? ""} ${product.category}`);
      return matchesCategory && (!normalizedQuery || haystack.includes(normalizedQuery) || haystack.replaceAll(" ", "").includes(compactQuery));
    });
    if (sort === "low") list.sort((a, b) => a.price - b.price);
    if (sort === "high") list.sort((a, b) => b.price - a.price);
    if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [catalog, query, activeCategory, sort]);

  return <div className="px-page px-container">
    <div className="px-page-title"><span>PARTS CATALOG</span><h1>Shop parts</h1><p>Verified options for your {vehicle?.year} {vehicle?.make} {vehicle?.model}.</p></div>
    <div className="px-shop-tools">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, brand, OEM or part number" aria-label="Search catalog"/>
      <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort parts"><option value="recommended">Recommended</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="rating">Top rated</option></select>
    </div>
    <div className="px-filter-row">{categories.map((item) => <button className={activeCategory === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
    <div className="px-results-line"><b>{products.length} parts</b><span>Live PartX catalog · approved Firebase sellers</span></div>
    {products.length ? <div className="px-product-grid px-shop-grid">{products.map((product) => <ProductCard product={product} key={product.id}/>)}</div> : <div className="px-empty"><h2>No matching parts</h2><p>Try a different part number, brand, or category.</p><button className="px-btn px-btn-dark" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters</button></div>}
  </div>;
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
