import { createApp } from "./app.js";
import { openDb } from "./database.js";
import { seedDatabase } from "./seed.js";
import { config } from "./lib.js";

const db = await openDb();

// auto-seed on first boot so the app has a catalog to show
const existing = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM orgs`))!;
if (Number(existing.n) === 0) {
  await seedDatabase(db);
  console.log("Seeded initial providers.");
}

const app = createApp(db);
app.listen(config.port, () => {
  console.log(`Fable+ API on http://localhost:${config.port} (db: ${db.dialect}, payments: sandbox)`);
});
