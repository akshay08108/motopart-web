export type PostalOffice = { name: string; district: string; state: string };
export function parsePostalOffices(data: unknown): PostalOffice[] {
  const result = Array.isArray(data) ? data[0] : null;
  if (result?.Status !== "Success" || !Array.isArray(result.PostOffice)) return [];
  const offices: PostalOffice[] = [];
  for (const row of result.PostOffice) {
    if (typeof row?.Name !== "string" || typeof row.District !== "string" || typeof row.State !== "string") continue;
    const office = { name: row.Name.trim().slice(0, 120), district: row.District.trim().slice(0, 120), state: row.State.trim().slice(0, 120) };
    if (office.name && office.district && office.state && !offices.some((item) => JSON.stringify(item) === JSON.stringify(office))) offices.push(office);
  }
  return offices.slice(0, 100);
}

export function appendPostalDetails(address: string, pin: string, office: PostalOffice, previousSuffix = "") {
  const suffix = [...new Set([office.name, office.district, office.state])].join(", ") + ` ${pin}`;
  let base = address.trim();
  if (previousSuffix && base.endsWith(previousSuffix)) base = base.slice(0, -previousSuffix.length).replace(/[,\s]+$/, "");
  // Preserve the user's building/street; never replace their address with a post office.
  base = base.replace(/\s*,?\s*\b[1-9]\d{5}\b\s*$/, "").replace(/[,\s]+$/, "");
  const parts = suffix.split(", ").filter((part) => !base.toLowerCase().includes(part.toLowerCase()));
  return { address: [base, ...parts].filter(Boolean).join(", "), suffix: parts.join(", ") };
}
