// Генерація додаткових подій Swap на вже розгорнутому пулі.
// Запуск: node scripts/make_swaps.js [кількість]   (за замовчуванням 4)
// Зручно запускати, поки працює бекенд, щоб побачити, як події з'являються в таблиці.

import {
  connectContracts,
  ensureFunds,
  getProvider,
  getSigners,
  loadDeployment,
  runSwap,
} from "./chain.js";

const count = Number(process.argv[2] ?? 4);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function main() {
  const dep = loadDeployment();
  const provider = getProvider();
  const [deployer, trader1, trader2] = await getSigners(provider, 3);
  const ctx = connectContracts(dep, provider);

  console.log(`Виконуємо ${count} обмінів на пулі ${dep.pool}`);
  for (let i = 0; i < count; i++) {
    const trader = pick([trader1, trader2]);
    const symbol = pick([dep.tokens.A.symbol, dep.tokens.B.symbol]);
    const amount = 5 + Math.floor(Math.random() * 120);
    await ensureFunds(ctx, deployer, trader);
    await runSwap(ctx, dep, trader, symbol, amount);
  }
}

main().catch((error) => {
  console.error("Помилка:", error.shortMessage ?? error.message);
  process.exit(1);
});
