import "./env.js";
import { createApp } from "./app.js";
import { openDb } from "./database.js";
import { seedDatabase } from "./seed.js";
import { assertProductionConfig, config } from "./lib.js";

assertProductionConfig(); // fail fast if production secrets are missing/default

const db = await openDb();

// auto-seed on first boot so the app has a catalog to show
const existing = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM orgs`))!;
if (Number(existing.n) === 0) {
  await seedDatabase(db);
  console.log("Seeded initial providers.");
}

const app = createApp(db);
const server = app.listen(config.port, () => {
  console.log(`Fable+ API on http://localhost:${config.port} (db: ${db.dialect}, env: ${config.nodeEnv})`);
});

// graceful shutdown — stop accepting connections, close the DB, then exit
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`${sig} received — shutting down`);
    server.close(() => {
      db.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
