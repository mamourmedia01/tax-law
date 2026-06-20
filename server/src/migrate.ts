// Standalone migration runner for deploy pipelines: apply all pending schema
// migrations, print what was applied, then exit. Run this once before booting
// (or scaling) app servers so the schema is ready before traffic arrives.
//
//   npm run migrate           # uses DATABASE_URL (pg) or the sqlite dbPath
//
import "dotenv/config";
import { openDb } from "./database.js";
import { MIGRATIONS, runMigrations } from "./migrations.js";

const db = await openDb();
const applied = await runMigrations(db); // openDb already applies; this confirms + reports
const ledger = await db.all<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id");
console.log(`[migrate] dialect=${db.dialect}`);
console.log(`[migrate] defined: ${MIGRATIONS.length} | applied this run: ${applied.length}`);
console.log(`[migrate] ledger: ${ledger.map((r) => r.id).join(", ")}`);
await db.close();
