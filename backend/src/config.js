import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 3001);
export const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
export const DB_FILE = process.env.DB_FILE ?? path.join(here, "..", "swaps.db");
// deployment.json створює скрипт scripts/deploy_and_simulate.js у корені проєкту
export const DEPLOYMENT_FILE =
  process.env.DEPLOYMENT_FILE ?? path.join(here, "..", "..", "deployment.json");

export function loadDeployment() {
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    throw new Error(
      `Не знайдено ${DEPLOYMENT_FILE}. Спочатку виконайте: node scripts/deploy_and_simulate.js`
    );
  }
  return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
}
