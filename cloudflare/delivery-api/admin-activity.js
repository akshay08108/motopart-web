const day = 86_400_000;
const presenceWindow = 150_000;
const historyWindow = 30 * day;

export class PartXAdminActivity {
  constructor(context) {
    this.storage = context.storage;
    this.sql = context.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sign_ins (
      uid TEXT NOT NULL, signed_in_at INTEGER NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
      PRIMARY KEY (uid, signed_in_at)
    )`);
    this.sql.exec("CREATE INDEX IF NOT EXISTS sign_ins_time ON sign_ins(signed_in_at DESC, uid)");
    this.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS guest_session_once ON sign_ins(uid) WHERE role = 'guest'");
    this.sql.exec("CREATE INDEX IF NOT EXISTS sign_ins_role_time ON sign_ins(role, signed_in_at DESC, uid)");
    this.sql.exec(`CREATE TABLE IF NOT EXISTS activity_accounts (
      uid TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
      signed_in_at INTEGER, seen_at INTEGER
    )`);
    this.sql.exec("CREATE INDEX IF NOT EXISTS activity_presence ON activity_accounts(seen_at DESC)");
    context.blockConcurrencyWhile(async () => {
      if (await this.storage.getAlarm() === null) await this.storage.setAlarm(Date.now() + day);
    });
  }

  async alarm() {
    const now = Date.now();
    this.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM sign_ins WHERE signed_in_at < ?", now - historyWindow);
      this.sql.exec("DELETE FROM activity_accounts WHERE signed_in_at IS NULL AND seen_at < ?", now - presenceWindow);
      this.sql.exec("UPDATE activity_accounts SET seen_at = NULL WHERE seen_at < ?", now - presenceWindow);
    });
    await this.storage.setAlarm(now + day);
  }

  async fetch(request) {
    const action = new URL(request.url).pathname;
    if (action === "/read") {
      const now = Date.now();
      const { before, activity } = await request.json();
      const roleFilter = activity === "guests" ? "AND role = 'guest'" : activity === "accounts" ? "AND role != 'guest'" : "";
      const signIns = this.sql.exec(`SELECT uid, name, role, signed_in_at AS signedInAt FROM sign_ins
        WHERE signed_in_at >= ? AND (signed_in_at < ? OR (signed_in_at = ? AND uid > ?))
        ${roleFilter} ORDER BY signed_in_at DESC, uid LIMIT 26`,
        now - historyWindow, before?.signedInAt ?? now + 31_000, before?.signedInAt ?? now + 31_000, before?.uid ?? "").toArray();
      const presence = this.sql.exec(`SELECT uid, name, role, seen_at AS seenAt FROM activity_accounts
        WHERE seen_at >= ? ORDER BY seen_at DESC LIMIT 50`, now - presenceWindow).toArray();
      const counts = this.sql.exec(`SELECT role, COUNT(*) AS total FROM activity_accounts
        WHERE seen_at >= ? GROUP BY role`, now - presenceWindow).toArray();
      return Response.json({ signIns: signIns.slice(0, 25), next: signIns.length > 25 ? signIns[24] : null, presence, counts, asOf: now });
    }
    if (action === "/guest") {
      const { uid } = await request.json();
      this.sql.exec("INSERT OR IGNORE INTO sign_ins VALUES (?, ?, 'Guest session', 'guest')", uid, Date.now());
      return Response.json({ ok: true });
    }
    if (action === "/latest") {
      const { uids } = await request.json();
      const latest = uids.length ? this.sql.exec(`SELECT uid, signed_in_at AS signedInAt FROM activity_accounts
        WHERE uid IN (${uids.map(() => "?").join(",")}) AND signed_in_at IS NOT NULL`, ...uids).toArray() : [];
      return Response.json(Object.fromEntries(latest.map(({ uid, signedInAt }) => [uid, signedInAt])));
    }
    if (action === "/sign-in" || action === "/presence") {
      const { uid, name, role, signedInAt } = await request.json();
      this.storage.transactionSync(() => {
        if (action === "/sign-in") {
          this.sql.exec("INSERT OR IGNORE INTO sign_ins VALUES (?, ?, ?, ?)", uid, signedInAt, name, role);
          this.sql.exec(`INSERT INTO activity_accounts(uid, name, role, signed_in_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET signed_in_at = excluded.signed_in_at, name = excluded.name, role = excluded.role
            WHERE activity_accounts.signed_in_at IS NULL OR excluded.signed_in_at > activity_accounts.signed_in_at`, uid, name, role, signedInAt);
        } else {
          const now = Date.now();
          this.sql.exec(`INSERT INTO activity_accounts(uid, name, role, seen_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET seen_at = excluded.seen_at, name = excluded.name, role = excluded.role
            WHERE activity_accounts.seen_at IS NULL OR excluded.seen_at - activity_accounts.seen_at >= 30000`, uid, name, role, now);
        }
      });
      return Response.json({ ok: true });
    }
    return new Response(null, { status: 404 });
  }
}
