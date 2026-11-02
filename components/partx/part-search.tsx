"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchParts } from "@/lib/catalog-search";
import { productHref } from "@/lib/navigation";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";

export function PartSearch({ value, onChange, onSearch, className = "", label = "Search parts", placeholder = "Search parts, brand or part number" }: {
  value?: string; onChange?: (value: string) => void; onSearch?: (value: string) => void;
  className?: string; label?: string; placeholder?: string;
}) {
  const router = useRouter();
  const { catalog } = usePartX();
  const [localValue, setLocalValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  const query = value ?? localValue;
  const products = useMemo(() => query.trim().length >= 2 ? searchParts(catalog, query).slice(0, 5) : [], [catalog, query]);
  const categories = [...new Set(products.map((product) => product.category))].slice(0, 3);
  const show = open && query.trim().length >= 2;
  const count = categories.length + products.length + 1;
  function change(next: string) { setLocalValue(next); onChange?.(next); setActive(-1); }
  function search(term: string) {
    change(term); setOpen(false);
    input.current?.blur();
    if (onSearch) onSearch(term);
    else router.push(`/shop${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ""}`);
  }
  function select(index: number) {
    if (index < categories.length) search(categories[index]);
    else if (index < categories.length + products.length) { setOpen(false); input.current?.blur(); router.push(productHref(products[index - categories.length].id)); }
    else search(query);
  }
  return <div ref={container} className={`px-search-shell ${className}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <form className="px-search-form" role="search" onSubmit={(event) => { event.preventDefault(); search(query); }}>
      <Icon name="search"/>
      <input ref={input} id={`${id}-input`} value={query} type="search" role="combobox" autoComplete="off" enterKeyHint="search" aria-label={label} aria-autocomplete="list" aria-expanded={show} aria-controls={show ? `${id}-results` : undefined} aria-activedescendant={show && active >= 0 ? `${id}-option-${active}` : undefined} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(event) => { change(event.target.value); setOpen(true); }} onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); setActive(-1); }
        if (event.key === "ArrowDown" && query.trim().length >= 2) { event.preventDefault(); setOpen(true); setActive((current) => (current + 1) % count); }
        if (event.key === "ArrowUp" && query.trim().length >= 2) { event.preventDefault(); setOpen(true); setActive((current) => (current - 1 + count) % count); }
        if (event.key === "Enter" && show && active >= 0) { event.preventDefault(); select(active); }
      }}/>
      <button type="submit" aria-label={`Submit ${label.toLowerCase()}`}><Icon name="arrow"/></button>
    </form>
    {show ? <div className="px-search-dropdown" onMouseDown={(event) => event.preventDefault()}><div id={`${id}-results`} role="listbox" aria-label="Relevant search suggestions">
      {categories.length ? <><p>Related searches</p>{categories.map((category, index) => <button type="button" role="option" aria-selected={active === index} id={`${id}-option-${index}`} key={category} onClick={() => search(category)}><Icon name="search"/><span>{category}</span><Icon name="arrow"/></button>)}</> : null}
      {products.length ? <><p>Matching parts</p>{products.map((product, index) => <Link role="option" aria-selected={active === index + categories.length} id={`${id}-option-${index + categories.length}`} href={productHref(product.id)} key={product.id} onClick={() => { setOpen(false); input.current?.blur(); }}><Image src={product.imageUrl ?? `/parts/${product.imageIndex}-v2.png`} alt="" width={40} height={36}/><span><b>{product.name}</b><small>{product.seller} · {product.partNumber}</small></span><strong>₹{product.price.toLocaleString("en-IN")}</strong></Link>)}</> : <p>No matching parts yet. Try a brand, part number or category.</p>}
      <button type="button" role="option" aria-selected={active === count - 1} id={`${id}-option-${count - 1}`} className="px-search-view-all" onClick={() => search(query)}>Search all results for “{query}”<Icon name="arrow"/></button>
    </div></div> : null}
  </div>;
}
