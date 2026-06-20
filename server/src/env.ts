// Load server/.env regardless of the process cwd, BEFORE any module reads process.env.
// Imported first in index.ts so config (lib.ts) sees the values.
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
