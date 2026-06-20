import Database from "better-sqlite3";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { config } from "./lib.js";
import { runMigrations } from "./migrations.js";

// ---------------------------------------------------------------------------
// Async database abstraction with two backends:
//   - SQLite (better-sqlite3) for dev/tests — zero-config, fast, in-memory.
//   - Postgres (pg, pooled) for scale — async, multi-writer, no event-loop block.
//
// Service code is written against this single async interface using `?`
// placeholders; the Postgres adapter rewrites them to `$1..$n`.
// ---------------------------------------------------------------------------

export interface Db {
  readonly dialect: "sqlite" | "pg";
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  tx<T>(fn: (t: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// The schema now lives in server/src/migrations.ts as an ordered, tracked set of
// migrations. openDb() runs all pending migrations at startup (see runMigrations).

// --- SQLite adapter ----------------------------------------------------------
class SqliteDb implements Db {
  readonly dialect = "sqlite" as const;
  constructor(private raw: Database.Database) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.raw.prepare(sql).get(...(params as never[])) as T | undefined;
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.raw.prepare(sql).all(...(params as never[])) as T[];
  }
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const info = this.raw.prepare(sql).run(...(params as never[]));
    return { changes: info.changes };
  }
  // All underlying ops are synchronous, so a manual BEGIN/COMMIT is safe: the
  // awaited chain inside `fn` resolves on the microtask queue before any other
  // request (a macrotask) runs, so transactions never interleave.
  async tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
    this.raw.exec("BEGIN");
    try {
      const r = await fn(this);
      this.raw.exec("COMMIT");
      return r;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    }
  }
  async close(): Promise<void> {
    this.raw.close();
  }
}

// --- Postgres adapter --------------------------------------------------------
// Return BIGINT (int8, oid 20) as a JS number — our timestamps/counts fit safely.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

type Queryable = pg.Pool | pg.PoolClient;

class PgDb implements Db {
  readonly dialect = "pg" as const;
  constructor(
    private pool: pg.Pool,
    private client?: pg.PoolClient,
  ) {}
  private q(): Queryable {
    return this.client ?? this.pool;
  }
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const r = await this.q().query(toPgPlaceholders(sql), params as never[]);
    return r.rows[0] as T | undefined;
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.q().query(toPgPlaceholders(sql), params as never[]);
    return r.rows as T[];
  }
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const r = await this.q().query(toPgPlaceholders(sql), params as never[]);
    return { changes: r.rowCount ?? 0 };
  }
  async tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const bound = new PgDb(this.pool, client);
    try {
      await client.query("BEGIN");
      const r = await fn(bound);
      await client.query("COMMIT");
      return r;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// --- factory -----------------------------------------------------------------
export async function openDb(opts?: { url?: string; sqlitePath?: string }): Promise<Db> {
  const url = opts?.url ?? config.databaseUrl;
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: config.pgPoolMax });
    const db = new PgDb(pool);
    await runMigrations(db);
    return db;
  }
  const file = opts?.sqlitePath ?? config.dbPath;
  if (file !== ":memory:") {
    const dir = path.dirname(file);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const raw = new Database(file);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  const db = new SqliteDb(raw);
  await runMigrations(db);
  return db;
}
