import { describe, it, expect } from "vitest";
import { openDb } from "../src/database.js";
import { runMigrations, MIGRATIONS } from "../src/migrations.js";

describe("schema migrations", () => {
  it("applies every migration once and records them in the ledger", async () => {
    const db = await openDb({ sqlitePath: ":memory:" });
    const applied = await db.all<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id");
    expect(applied.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));
    await db.close();
  });

  it("is idempotent — re-running applies nothing", async () => {
    const db = await openDb({ sqlitePath: ":memory:" });
    const second = await runMigrations(db); // openDb already ran them
    expect(second).toEqual([]); // nothing pending
    await db.close();
  });

  it("creates the core tables the app depends on", async () => {
    const db = await openDb({ sqlitePath: ":memory:" });
    for (const t of ["users", "orgs", "bookings", "payments", "schema_migrations"]) {
      const row = await db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [t],
      );
      expect(row?.name).toBe(t);
    }
    await db.close();
  });
});
