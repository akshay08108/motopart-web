"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { PartnerStore } from "@/lib/types";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";

const preferredCategories = ["Brakes", "Filters", "Batteries", "Engine", "Electrical", "Suspension", "Accessories", "Other"];

export function ShopPage() {
  const params = useSearchParams();
  const initialCategory = params.get("category") ?? "All";
  const [view, setView] = useState<"parts" | "stores">(params.get("view") === "stores" ? "stores" : "parts");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState("recommended");
  const [storeSort, setStoreSort] = useState("rated");
  const { vehicles, activeVehicleId, catalog, stores } = usePartX();
  const categories = useMemo(() => ["All", ...preferredCategories.filter((item) => catalog.some((product) => product.category === item)), ...[...new Set(catalog.map((product) => product.category))].filter((item) => !preferredCategories.includes(item))], [catalog]);
  const [category, setCategory] = useState(initialCategory);
  const activeCategory = categories.includes(category) ? category : "All";
  const vehicle = vehicles.find((item) => item.id === activeVehicleId);
  const products = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    const compactQuery = normalizedQuery.replaceAll(" ", "");
    const list = catalog.filter((product) => {
      const matchesCategory = activeCategory === "All" || product.category === activeCategory;
      const haystack = normalizeSearch(`${product.name} ${product.brand} ${product.partNumber} ${product.oemNumber} ${product.barcode ?? ""} ${product.category} ${product.seller}`);
      return matchesCategory && (!normalizedQuery || haystack.includes(normalizedQuery) || haystack.replaceAll(" ", "").includes(compactQuery));
    });
    if (sort === "low") list.sort((a, b) => a.price - b.price);
    if (sort === "high") list.sort((a, b) => b.price - a.price);
    if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [catalog, query, activeCategory, sort]);
  const visibleStores = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    const list = stores.filter((store) => {
      const listingText = store.listings.map((listing) => `${listing.productName} ${listing.partNumber} ${listing.category}`).join(" ");
      const haystack = normalizeSearch(`${store.name} ${store.location.address} ${store.businessHours} ${listingText}`);
      return !normalizedQuery || haystack.includes(normalizedQuery);
    });
    if (storeSort === "products") list.sort((a, b) => b.listings.length - a.listings.length);
    if (storeSort === "nearest") list.sort((a, b) => a.distanceKm - b.distanceKm);
    if (storeSort === "rated") list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [query, storeSort, stores]);

  const showStoreProducts = (store: PartnerStore) => {
    setQuery(store.name);
    setCategory("All");
    setView("parts");
  };

  return <div className="px-page px-container">
    <div className="px-page-title"><span>PARTX MARKETPLACE</span><h1>{view === "parts" ? "Shop parts" : "Shop by store"}</h1><p>{view === "parts" ? `Verified options for your ${vehicle?.year} ${vehicle?.make} ${vehicle?.model}.` : "Browse approved PartX sellers and shop directly from their live catalog."}</p></div>
    <div className="px-shop-view-switch" role="tablist" aria-label="Shop view">
      <button role="tab" aria-selected={view === "parts"} className={view === "parts" ? "active" : ""} onClick={() => { setView("parts"); setQuery(""); }}><Icon name="box"/>Shop parts</button>
      <button role="tab" aria-selected={view === "stores"} className={view === "stores" ? "active" : ""} onClick={() => { setView("stores"); setQuery(""); }}><Icon name="store"/>Shop by store</button>
    </div>
    <div className="px-shop-tools">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === "parts" ? "Search name, store, brand, OEM or part number" : "Search store, location, category or part"} aria-label={view === "parts" ? "Search catalog" : "Search stores"}/>
      {view === "parts" ? <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort parts"><option value="recommended">Recommended</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="rating">Top rated</option></select> : <select value={storeSort} onChange={(event) => setStoreSort(event.target.value)} aria-label="Sort stores"><option value="rated">Top rated</option><option value="products">Most products</option><option value="nearest">Nearest first</option></select>}
    </div>
    {view === "parts" ? <>
      <div className="px-filter-row">{categories.map((item) => <button className={activeCategory === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
      <div className="px-results-line"><b>{products.length} parts</b><span>Live PartX catalog · approved Firebase sellers</span></div>
      {products.length ? <div className="px-product-grid px-shop-grid">{products.map((product) => <ProductCard product={product} key={product.id}/>)}</div> : <div className="px-empty"><h2>No matching parts</h2><p>Try a different part number, brand, store, or category.</p><button className="px-btn px-btn-dark" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters</button></div>}
    </> : <>
      <div className="px-results-line"><b>{visibleStores.length} approved stores</b><span>Newly approved seller stores appear here automatically from Firebase</span></div>
      {visibleStores.length ? <div className="px-store-directory">{visibleStores.map((store) => <StoreCard store={store} onShop={() => showStoreProducts(store)} key={store.id}/>)}</div> : <div className="px-empty"><Icon name="store"/><h2>No matching stores</h2><p>Try a different store name, location, product, or category.</p><button className="px-btn px-btn-dark" onClick={() => setQuery("")}>Clear search</button></div>}
    </>}
  </div>;
}

function StoreCard({ store, onShop }: { store: PartnerStore; onShop: () => void }) {
  const inStock = store.listings.filter((listing) => listing.stock > 0).length;
  return <article className="px-store-card">
    <header><span className="px-store-mark">{store.name.slice(0, 2).toUpperCase()}</span><div><em><Icon name="check"/>Approved seller</em><h2>{store.name}</h2><p><Icon name="pin"/>{store.location.address}</p></div></header>
    <div className="px-store-metrics"><span><b>{store.rating > 0 ? `★ ${store.rating.toFixed(1)}` : "New"}</b>{store.ratingCount ? `${store.ratingCount} ratings` : "Store rating"}</span><span><b>{store.listings.length}</b>Listed parts</span><span><b>{inStock}</b>In stock</span></div>
    <div className="px-store-hours"><Icon name="orders"/><span><b>{store.businessHours}</b>{store.deliveryRadiusKm > 0 ? `Delivery up to ${store.deliveryRadiusKm} km` : "Pickup and delivery details at checkout"}</span></div>
    <button className="px-btn px-btn-red" disabled={!store.listings.length} onClick={onShop}>{store.listings.length ? "View store products" : "Products coming soon"}<Icon name="arrow"/></button>
  </article>;
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
