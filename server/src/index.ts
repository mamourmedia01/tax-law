import { createApp } from "./app.js";
import { createDb } from "./db.js";
import { seedDatabase } from "./seed.js";
import { config } from "./lib.js";

const db = createDb(config.dbPath);

// auto-seed on first boot so the app has a catalog to show
const existing = db.prepare(`SELECT COUNT(*) AS n FROM orgs`).get() as { n: number };
if (existing.n === 0) {
  seedDatabase(db);
  console.log(`Seeded ${existing.n === 0 ? "initial" : ""} providers.`);
}

const app = createApp(db);
app.listen(config.port, () => {
  console.log(`Fable+ API listening on http://localhost:${config.port} (payments: sandbox)`);
});
