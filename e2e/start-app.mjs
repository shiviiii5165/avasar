// Starts Avsar for browser tests: wipes the isolated test database, seeds sample listings, then runs `next dev`.
// The database lives in the system temp folder: files changing inside the project make the dev server reload pages.
// Refuses to run unless the embedded test database is forced, so it can never seed a real database.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

if (process.env.AVSAR_EMBEDDED_DB !== "1" || !process.env.AVSAR_PGLITE_DIR) {
  console.error("e2e/start-app.mjs: AVSAR_EMBEDDED_DB=1 and AVSAR_PGLITE_DIR are required (isolated test database).");
  process.exit(1);
}
const dir = path.resolve(process.env.AVSAR_PGLITE_DIR);
if (!dir.includes(`${path.sep}avsar-playwright${path.sep}`)) {
  console.error(`e2e/start-app.mjs: refusing to wipe ${dir} (must be inside an avsar-playwright test folder).`);
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });

const bin = (name) => path.join("node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const seed = spawnSync(bin("tsx"), ["--conditions=react-server", "scripts/db.ts", "seed"], { stdio: "inherit", shell: process.platform === "win32" });
if (seed.status !== 0) process.exit(seed.status ?? 1);

const app = spawn(bin("next"), ["dev", "-p", process.env.PORT ?? "3300"], { stdio: "inherit", shell: process.platform === "win32" });
const stop = () => app.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
app.on("exit", (code) => process.exit(code ?? 0));
