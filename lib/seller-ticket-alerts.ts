type TicketAlertEntry = { id: string; storeId: string; status: string };

/** Cached and initial server results populate the list without announcing old tickets. */
export function createTicketAlertTracker<T extends TicketAlertEntry>(storeId: string) {
  let ready = false;
  const seen = new Set<string>();
  return (tickets: readonly T[], fromCache: boolean): T | null => {
    if (fromCache) return null;
    const owned = tickets.filter((ticket) => ticket.storeId === storeId);
    const incoming = ready ? owned.find((ticket) => ticket.status === "Open" && !seen.has(ticket.id)) ?? null : null;
    for (const ticket of owned) seen.add(ticket.id);
    ready = true;
    return incoming;
  };
}
