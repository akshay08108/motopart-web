"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Icon } from "@/components/partx/icons";
import { PartXAdminError, requestPartXAdmin } from "@/lib/partx-admin-api";
import { signOutAdmin, useAdminSession } from "./session";
import styles from "./admin.module.css";

type Kind = "people" | "stores" | "riders" | "orders" | "deliveries" | "tickets" | "afterSales";
type Queue = "stalled" | "activations" | "tickets" | "verification";
type Page = "overview" | "activity" | "attention" | Exclude<Kind, "tickets" | "afterSales">;
type DataRow = { id: string; [key: string]: unknown };
type Cursor = { id: string; value: string; cutoff: number };
type Overview = Record<"customers" | "sellers" | "stores" | "riders" | "todayOrders" | "activeDeliveries" | "asOf", number> & { attention: Record<Queue, number> };
type SignIn = { uid: string; name: string; role: string; signedInAt: number };
type Activity = { signIns: SignIn[]; presence: { uid: string; name: string; role: string; seenAt: number }[]; counts: { role: string; total: number }[]; asOf: number; next: SignIn | null };
type Listing = { kind: Kind; rows: DataRow[]; next: Cursor | null; activityAvailable?: boolean };
type OrderItem = { productName: string; partNumber: string | null; quantity: number | null; unitPrice: number | null };
type Detail = { kind: Kind; record: DataRow; related: Partial<Record<Kind, DataRow[]>>; items?: OrderItem[] };
type FetchAdmin = <T>(data: object, signal?: AbortSignal) => Promise<T>;

const tabs: { id: Page; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "activity", label: "Live activity", icon: "bell" },
  { id: "people", label: "People", icon: "user" },
  { id: "stores", label: "Stores", icon: "store" },
  { id: "riders", label: "Riders", icon: "pin" },
  { id: "orders", label: "Orders", icon: "orders" },
  { id: "deliveries", label: "Deliveries", icon: "truck" },
  { id: "attention", label: "Needs attention", icon: "ticket" },
];
const queues: { id: Queue; label: string }[] = [
  { id: "stalled", label: "Stalled deliveries" },
  { id: "activations", label: "Pending rider activations" },
  { id: "tickets", label: "Open support tickets" },
  { id: "verification", label: "Payments awaiting verification" },
];
const names: Record<Kind, string> = { people: "Accounts", stores: "Stores", riders: "Riders", orders: "Orders", deliveries: "Deliveries", tickets: "Tickets", afterSales: "Returns and replacements" };
const columns: Record<Kind, string[]> = {
  people: ["name", "email", "roles", "createdAt", "lastSignIn"],
  stores: ["name", "status", "ownerId", "createdAt"],
  riders: ["name", "status", "lastSeenAt", "lastSignIn", "activeDeliveryId"],
  orders: ["id", "trackingId", "storeName", "status", "payment", "total", "createdAt"],
  deliveries: ["trackingId", "riderName", "status", "kind", "orderId", "createdAt"],
  tickets: ["id", "issueType", "status", "orderId", "createdAt"],
  afterSales: ["kind", "productName", "partNumber", "quantity", "status", "deliveryId"],
};
const labels: Record<string, string> = {
  id: "Record ID", name: "Name", email: "Email", roles: "Roles", status: "Status", orderStatus: "Order status",
  ownerId: "Owner ID", activeDeliveryId: "Active delivery ID", riderDeliveryId: "Delivery ID", orderId: "Order ID", deliveryId: "Delivery ID",
  customerId: "Customer ID", sellerId: "Seller ID", storeId: "Store ID", riderId: "Rider ID", trackingId: "Tracking ID",
  storeName: "Store", riderName: "Rider", payment: "Payment", total: "Total", fulfilment: "Fulfilment",
  createdAt: "Created", updatedAt: "Updated", deliveredAt: "Delivered", resolvedAt: "Resolved", lastSeenAt: "Last check-in", lastSignIn: "Last sign-in",
  issueType: "Issue type", issue: "Reported issue", kind: "Type", productName: "Part", partNumber: "Part number", quantity: "Quantity",
};
const formatTime = (value: number) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(value);
const formatMoney = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);

function valueText(key: string, value: unknown) {
  if (typeof value === "number" && ["createdAt", "updatedAt", "deliveredAt", "resolvedAt", "lastSeenAt", "lastSignIn"].includes(key)) return formatTime(value);
  if (typeof value === "number" && key === "total") return formatMoney(value);
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "string" && value) return value;
  return typeof value === "number" ? String(value) : "—";
}

export default function AdminPage() {
  const router = useRouter();
  const session = useAdminSession();
  useEffect(() => {
    if (["signed-out", "denied", "verify-email"].includes(session.state)) router.replace("/admin/login");
  }, [router, session.state]);

  if (session.state !== "owner" || !session.user) return <main className={styles.login}>
    {session.state === "unavailable" ? <div role="alert" className={styles.loginCard}>Owner access could not be checked. <button onClick={session.retry}>Try again</button></div> : <p role="status">Checking owner access…</p>}
  </main>;
  return <Dashboard key={session.user.uid} user={session.user}/>;
}

function Dashboard({ user }: { user: User }) {
  const [page, setPage] = useState<Page>("overview");
  const [queue, setQueue] = useState<Queue>("stalled");
  const [signOutError, setSignOutError] = useState("");
  const [closedTicket, setClosedTicket] = useState("");
  const [ticketQueueVersion, setTicketQueueVersion] = useState(0);
  const [selected, setSelected] = useState<{ kind: Kind; id: string }>();
  const [role, setRole] = useState("");
  const [active, setActive] = useState(false);
  const [today, setToday] = useState(false);
  const fetchAdmin: FetchAdmin = useCallback(async <T,>(data: object, signal?: AbortSignal) => {
    try { return await requestPartXAdmin<T>(user, "partxAdmin", data, signal); }
    catch (error) {
      if (error instanceof PartXAdminError && [401, 403].includes(error.status)) void signOutAdmin().catch(() => undefined);
      throw error;
    }
  }, [user]);

  function navigate(destination: Page, options: { queue?: Queue; role?: string; active?: boolean; today?: boolean } = {}) {
    setSelected(undefined);
    setClosedTicket("");
    setPage(destination);
    setRole(options.role ?? "");
    setActive(options.active ?? false);
    setToday(options.today ?? false);
    if (options.queue) setQueue(options.queue);
  }

  return <div className={styles.shell}>
    <aside className={styles.rail}>
      <div className={styles.brand}><Image src="/brand/partx-dark.png" alt="" width={36} height={36}/><span>Part<b>X</b></span></div>
      <nav aria-label="Admin navigation">
        {tabs.map((tab) => <button type="button" key={tab.id} aria-current={page === tab.id ? "page" : undefined} onClick={() => navigate(tab.id)}><Icon name={tab.icon}/>{tab.label}</button>)}
      </nav>
    </aside>
    <main className={styles.main}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>PartX operations</p><h1>{tabs.find((tab) => tab.id === page)?.label}</h1></div>
        <button className={styles.secondary} onClick={() => void signOutAdmin().catch(() => setSignOutError("Could not sign out. Try again."))}>Sign out</button>
      </header>
      {signOutError && <p role="alert" className={styles.error}>{signOutError}</p>}
      {closedTicket && <p role="status" className={styles.success}>Ticket {closedTicket} marked as resolved.</p>}
      {page === "overview" && <OverviewPanel fetchAdmin={fetchAdmin} navigate={navigate}/>}
      {page === "activity" && <ActivityPanel fetchAdmin={fetchAdmin} open={(id) => setSelected({ kind: "people", id })}/>}
      {page === "attention" && <div className={styles.filters} aria-label="Attention queues">
        {queues.map((item) => <button type="button" key={item.id} aria-pressed={queue === item.id} onClick={() => { setSelected(undefined); setClosedTicket(""); setQueue(item.id); }}>{item.label}</button>)}
      </div>}
      {page !== "activity" && page !== "overview" && <Records key={`${page}:${role}:${active}:${today}:${page === "attention" ? queue : ""}:${page === "attention" && queue === "tickets" ? ticketQueueVersion : 0}`} page={page} queue={queue} initialRole={role} initialActive={active} initialToday={today} fetchAdmin={fetchAdmin} open={(kind, id) => setSelected({ kind, id })}/>}
      {selected && <RecordDetail key={`${selected.kind}:${selected.id}`} {...selected} fetchAdmin={fetchAdmin} close={() => setSelected(undefined)} open={(kind, id) => setSelected({ kind, id })} onTicketClosed={(id) => {
        setSelected(undefined);
        setClosedTicket(id);
        setTicketQueueVersion((version) => version + 1);
      }}/>}
    </main>
  </div>;
}

function useAdminData<T>(fetchAdmin: FetchAdmin, input: object, refresh?: number) {
  const [data, setData] = useState<{ request: string; value: T }>();
  const [error, setError] = useState<{ request: string; message: string }>();
  const [attempt, setAttempt] = useState(0);
  // Stable request content keeps automatic refreshes and React renders independent.
  const request = JSON.stringify(input);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (controller.signal.aborted) return;
      try {
        if (!refresh || document.visibilityState === "visible") {
          const value = await fetchAdmin<T>(JSON.parse(request), controller.signal);
          if (!controller.signal.aborted) { setData({ request, value }); setError(undefined); }
        }
      } catch (error) {
        if (!controller.signal.aborted) setError({ request, message: error instanceof Error ? error.message : "The latest data could not be loaded." });
      } finally {
        if (refresh && !controller.signal.aborted) timer = setTimeout(load, refresh);
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [fetchAdmin, request, refresh, attempt]);
  return { data: data?.request === request ? data.value : undefined, error: error?.request === request ? error.message : "", reload: () => setAttempt((value) => value + 1) };
}

function Feedback({ error, loading, reload }: { error: string; loading?: boolean; reload: () => void }) {
  if (error) return <div className={styles.error} role="alert">{error} <button type="button" onClick={reload}>Try again</button></div>;
  return loading ? <p className={styles.empty} role="status">Loading…</p> : null;
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className={styles.panel}><header><h2>{title}</h2>{action}</header>{children}</section>;
}

function OverviewPanel({ fetchAdmin, navigate }: { fetchAdmin: FetchAdmin; navigate: (page: Page, options?: { queue?: Queue; role?: string; active?: boolean; today?: boolean }) => void }) {
  const { data, error, reload } = useAdminData<Overview>(fetchAdmin, { view: "overview" });
  const cards = [
    { key: "customers", label: "Registered customers", open: () => navigate("people", { role: "customer" }) },
    { key: "sellers", label: "Registered sellers", open: () => navigate("people", { role: "seller" }) },
    { key: "stores", label: "Stores", open: () => navigate("stores") },
    { key: "riders", label: "Registered riders", open: () => navigate("people", { role: "rider" }) },
    { key: "todayOrders", label: "Orders today", open: () => navigate("orders", { today: true }) },
    { key: "activeDeliveries", label: "Active deliveries", open: () => navigate("deliveries", { active: true }) },
  ] as const;
  return <>
    <div className={styles.update}>{data && <span>Updated {formatTime(data.asOf)} IST</span>}<button type="button" className={styles.secondary} onClick={reload}>Refresh</button></div>
    <Feedback error={error} loading={!data} reload={reload}/>
    <div className={styles.metrics}>{cards.map((card) => <button key={card.key} type="button" onClick={card.open}><span>{card.label}</span><strong>{data?.[card.key]?.toLocaleString("en-IN") ?? "—"}</strong><Icon name="arrow"/></button>)}</div>
    <Panel title="Needs attention">
      <div className={styles.queue}>{queues.map((item) => <button key={item.id} type="button" onClick={() => navigate("attention", { queue: item.id })}><span>{item.label}</span><b>{data?.attention[item.id] ?? "—"}</b><Icon name="chevron"/></button>)}</div>
    </Panel>
  </>;
}

function ActivityPanel({ fetchAdmin, open }: { fetchAdmin: FetchAdmin; open: (id: string) => void }) {
  const { data, error, reload } = useAdminData<Activity>(fetchAdmin, { view: "activity" }, 10_000);
  const [history, setHistory] = useState<{ rows: SignIn[]; next: SignIn | null }>({ rows: [], next: null });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const newer = data?.signIns ?? [];
  const loaded = new Set(newer.map((row) => `${row.uid}:${row.signedInAt}`));
  const signIns = [...newer, ...history.rows.filter((row) => !loaded.has(`${row.uid}:${row.signedInAt}`))];
  const before = history.rows.length ? history.next : data?.next;
  const clients = ["customer", "seller"];
  async function older() {
    setLoadingOlder(true);
    setHistoryError("");
    try {
      const result = await fetchAdmin<Activity>({ view: "activity", before });
      setHistory({ rows: [...history.rows, ...result.signIns], next: result.next });
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Could not load older sign-ins.");
    } finally { setLoadingOlder(false); }
  }
  return <>
    <div className={styles.update}><span>{data ? `Updated ${formatTime(data.asOf)} IST · refreshes every 10 seconds` : "Refreshes every 10 seconds"}</span><button type="button" className={styles.secondary} onClick={reload}>Refresh</button></div>
    <Feedback error={error} loading={!data} reload={reload}/>
    <div className={styles.split}>
      <Panel title="Recent sign-ins">
        <p className={styles.panelNote}>30-day history from updated PartX apps.</p>
        {!signIns.length && data && <p className={styles.empty}>No sign-ins recorded yet.</p>}
        <ul className={styles.activity}>{signIns.map(({ uid, name, role, signedInAt }) => <li key={`${uid}:${signedInAt}`}><button onClick={() => open(uid)}>{name}</button><span>{role} · {formatTime(signedInAt)}</span></li>)}</ul>
        {historyError && <p className={styles.error} role="alert">{historyError}</p>}
        {before && <div className={styles.footer}><button className={styles.secondary} disabled={loadingOlder} onClick={() => void older()}>{loadingOlder ? "Loading…" : "Older sign-ins"}</button></div>}
      </Panel>
      <Panel title="Recently active">
        <div className={styles.presenceCounts}>{clients.map((role) => <div key={role}><b>{data ? data.counts.find((row) => row.role === role)?.total ?? 0 : "—"}</b><span>{role === "customer" ? "Customers" : "Sellers"}</span></div>)}</div>
        <p className={styles.panelNote}>Accounts with a foreground check-in in the last 2½ minutes. Showing up to 50.</p>
        {data?.presence.length === 0 && <p className={styles.empty}>No recent check-ins.</p>}
        <ul className={styles.activity}>{data?.presence.map(({ uid, name, role, seenAt }) => <li key={uid}><button onClick={() => open(uid)}>{name}</button><span>{role} · {formatTime(seenAt)}</span></li>)}</ul>
      </Panel>
    </div>
  </>;
}

function Records({ page, queue, initialRole, initialActive, initialToday, fetchAdmin, open }: {
  page: Exclude<Page, "overview" | "activity">; queue: Queue; initialRole: string; initialActive: boolean; initialToday: boolean; fetchAdmin: FetchAdmin; open: (kind: Kind, id: string) => void;
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchBy, setSearchBy] = useState<string>(({ people: "email", stores: "name", riders: "name", orders: "trackingId", deliveries: "trackingId" } as const)[page as Exclude<typeof page, "attention">] ?? "id");
  const [mode, setMode] = useState<string>(searchBy);
  const [role, setRole] = useState(initialRole);
  const [active, setActive] = useState(initialActive);
  const [today, setToday] = useState(initialToday);
  const [pages, setPages] = useState<(Cursor | null)[]>([null]);
  const { data, error, reload } = useAdminData<Listing>(fetchAdmin, { view: "list", kind: page, queue, search, searchBy: mode, role, active, today, cursor: pages.at(-1) });
  const options = page === "people" ? [["email", "Email"], ["name", "Name starts with"], ["id", "Account ID"]] :
    page === "stores" || page === "riders" ? [["name", "Name starts with"], ["id", "Record ID"]] :
    [["trackingId", "Tracking ID"], ["id", "Record ID"]];
  function submit(event: FormEvent) {
    event.preventDefault();
    setMode(searchBy);
    setSearch(input.trim());
    setPages([null]);
    reload();
  }
  return <Panel title={page === "attention" ? queues.find((item) => item.id === queue)?.label ?? "Needs attention" : names[page]}
    action={<button type="button" className={styles.secondary} onClick={reload}>Refresh</button>}>
    {page === "attention" && queue === "stalled" && <p className={styles.panelNote}>Active deliveries with no status or issue update for at least 45 minutes.</p>}
    {page !== "attention" && <form className={styles.search} onSubmit={submit}>
      <label>Search by<select value={searchBy} onChange={(event) => setSearchBy(event.target.value)}>{options.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label>Search records<input type="search" maxLength={200} value={input} onChange={(event) => setInput(event.target.value)}/></label>
      <button className={styles.primary}>Search</button>
      {search && <button type="button" className={styles.secondary} onClick={() => { setInput(""); setSearch(""); setPages([null]); }}>Clear</button>}
      {page === "people" && !search && <label>Role<select value={role} onChange={(event) => { setRole(event.target.value); setPages([null]); }}><option value="">All roles</option><option value="customer">Customers</option><option value="seller">Sellers</option><option value="rider">Riders</option></select></label>}
      {page === "deliveries" && !search && <label className={styles.check}><input type="checkbox" checked={active} onChange={(event) => { setActive(event.target.checked); setPages([null]); }}/>Active only</label>}
      {page === "orders" && !search && <label className={styles.check}><input type="checkbox" checked={today} onChange={(event) => { setToday(event.target.checked); setPages([null]); }}/>Today only (IST)</label>}
    </form>}
    <Feedback error={error} loading={!data} reload={reload}/>
    {data?.activityAvailable === false && <p className={styles.panelNote}>Sign-in history is temporarily unavailable.</p>}
    {data && <><RecordsTable kind={data.kind} rows={data.rows} open={open}/>
      {(pages.length > 1 || data.next) && <div className={styles.footer}>
        <button type="button" className={styles.secondary} disabled={pages.length <= 1} onClick={() => setPages(pages.slice(0, -1))}>Previous</button>
        <span>Page {pages.length}</span>
        <button type="button" className={styles.secondary} disabled={!data.next} onClick={() => setPages([...pages, data.next])}>Next</button>
      </div>}
    </>}
  </Panel>;
}

function RecordsTable({ kind, rows, open }: { kind: Kind; rows: DataRow[]; open: (kind: Kind, id: string) => void }) {
  if (!rows.length) return <p className={styles.empty}>No matching records.</p>;
  return <div className={styles.tableScroll}><table className={styles.table}><thead><tr>{columns[kind].map((key) => <th key={key} scope="col">{labels[key]}</th>)}{kind !== "afterSales" && <th scope="col">Details</th>}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}>{columns[kind].map((key) => <td key={key}>{valueText(key, row[key])}</td>)}{kind !== "afterSales" && <td><button type="button" onClick={() => open(kind, row.id)} aria-label={`View ${row.name ?? row.trackingId ?? row.id}`}>View</button></td>}</tr>)}</tbody></table></div>;
}

function OrderItems({ items }: { items: OrderItem[] }) {
  return <section aria-labelledby="admin-order-items">
    <h3 id="admin-order-items">Order items</h3>
    {items.length === 0 ? <p className={styles.empty}>No item details were saved for this order.</p> :
      <div className={styles.tableScroll}><table className={styles.table} aria-labelledby="admin-order-items">
        <thead><tr><th scope="col">Part</th><th scope="col">Part number</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Line subtotal</th></tr></thead>
        <tbody>{items.map(({ productName, partNumber, quantity, unitPrice }, index) => <tr key={index}>
          <th scope="row">{productName}</th><td>{partNumber ?? "—"}</td><td>{quantity ?? "—"}</td>
          <td>{unitPrice === null ? "—" : formatMoney(unitPrice)}</td>
          <td>{unitPrice === null || quantity === null ? "—" : formatMoney(unitPrice * quantity)}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}

const links: Record<string, Kind> = { orderId: "orders", customerId: "people", sellerId: "people", ownerId: "people", storeId: "stores", riderId: "riders", riderDeliveryId: "deliveries", activeDeliveryId: "deliveries", deliveryId: "deliveries" };

function RecordDetail({ kind, id, fetchAdmin, close, open, onTicketClosed }: {
  kind: Kind; id: string; fetchAdmin: FetchAdmin; close: () => void; open: (kind: Kind, id: string) => void; onTicketClosed: (id: string) => void;
}) {
  const { data, error, reload } = useAdminData<Detail>(fetchAdmin, { view: "detail", kind, id });
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  useEffect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  }, [dialog]);
  async function resolveTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (closing) return;
    setClosing(true);
    setCloseError("");
    try {
      await fetchAdmin({ action: "closeTicket", id });
      onTicketClosed(id);
    } catch (reason) {
      setCloseError(reason instanceof PartXAdminError ? reason.message : "Could not close the ticket. Try again.");
      setClosing(false);
    }
  }

  return <dialog className={styles.detail} ref={setDialog} onCancel={(event) => { if (closing) event.preventDefault(); else close(); }} aria-labelledby="admin-record-title">
    <header><div><p className={styles.eyebrow}>{names[kind]}</p><h2 id="admin-record-title">{String(data?.record.name ?? data?.record.trackingId ?? id)}</h2></div><button type="button" className={styles.secondary} onClick={close} disabled={closing} autoFocus>{kind === "tickets" ? "Close details" : "Close"}</button></header>
    <Feedback error={error} loading={!data} reload={reload}/>
    {data && <>
      {kind === "orders" && <OrderItems items={data.items ?? []}/>}
      {data.record.activityAvailable === false && <p className={styles.panelNote}>Sign-in history is temporarily unavailable.</p>}
      <dl className={kind === "orders" ? styles.orderMetadata : undefined}>{Object.entries(data.record).filter(([key]) => labels[key]).map(([key, value]) => <div key={key}><dt>{labels[key]}</dt><dd>{links[key] && typeof value === "string" && value ? <button type="button" onClick={() => open(links[key], value)}>{value}</button> : valueText(key, value)}</dd></div>)}</dl>
      {Object.entries(data.related).map(([relatedKind, rows]) => <section key={relatedKind}><h3>{names[relatedKind as Kind]}</h3><RecordsTable kind={relatedKind as Kind} rows={rows} open={open}/></section>)}
      {kind === "tickets" && data.record.canClose === true && <form className={styles.ticketActions} onSubmit={(event) => void resolveTicket(event)}>
        {confirming ? <>
          <p>Mark this ticket as resolved and remove it from the open queue?</p>
          <button type="button" className={styles.secondary} disabled={closing} onClick={() => { setConfirming(false); setCloseError(""); }}>Cancel</button>
          <button type="submit" className={styles.primary} disabled={closing}>{closing ? "Closing ticket…" : "Confirm close"}</button>
        </> : <button type="button" className={styles.primary} onClick={() => setConfirming(true)}>Close ticket</button>}
        {closeError && <div className={styles.error} role="alert">{closeError}</div>}
      </form>}
    </>}
  </dialog>;
}
