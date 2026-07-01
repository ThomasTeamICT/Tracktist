// Ensure apps/web/.env exists before bootstrap (copy from .env.example).
// Cross-platform; runs from the monorepo root. Never overwrites an existing file.
import { existsSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve("apps/web/.env");
const source = resolve(".env.example");

if (existsSync(target)) {
  console.log("✓ apps/web/.env already exists — leaving it untouched.");
} else if (existsSync(source)) {
  copyFileSync(source, target);
  console.log("✓ Created apps/web/.env from .env.example.");
  console.log("  (Fill in real keys later for live data/login; the demo works as-is.)");
} else {
  console.error("✗ Could not find .env.example at the repo root.");
  process.exit(1);
}
