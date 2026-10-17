// Лабораторна робота №3: бекенд-сервіс
// Автор: Вертій Максим Олександрович
//
// 1. підключається до RPC-вузла;
// 2. слухає події Swap із контракту DexPool;
// 3. зберігає їх у реляційну БД SQLite;
// 4. віддає записи користувача через REST API: GET /api/swaps/:address

import { DB_FILE, PORT, RPC_URL, loadDeployment } from "./config.js";
import { openStore } from "./db.js";
import { startListener } from "./listener.js";
import { createApp } from "./server.js";

async function main() {
  const deployment = loadDeployment();
  const store = openStore(DB_FILE);

  await startListener({ rpcUrl: RPC_URL, deployment, store });

  createApp({ store, deployment }).listen(PORT, () => {
    console.log(`REST API: http://localhost:${PORT}/api/swaps/<адреса>`);
  });
}

main().catch((error) => {
  console.error("Помилка запуску:", error.message);
  process.exit(1);
});
