import { ethers } from "ethers";

// Мінімальний ABI: лише подія Swap з нашого контракту DexPool
const POOL_ABI = [
  "event Swap(address indexed trader, address indexed tokenIn, uint256 amountIn, uint256 amountOut, uint256 feeBps)",
];

export async function startListener({ rpcUrl, deployment, store }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  provider.pollingInterval = 1000;

  // 2a. Підключення до RPC-вузла
  let head;
  try {
    head = await provider.getBlockNumber();
  } catch {
    throw new Error(`RPC-вузол недоступний: ${rpcUrl}. Запустіть: npx hardhat node`);
  }
  const code = await provider.getCode(deployment.pool);
  if (code === "0x") {
    throw new Error(
      "За адресою пулу з deployment.json немає контракту. Виконайте: node scripts/deploy_and_simulate.js"
    );
  }

  const deployBlock = await provider.getBlock(deployment.deployBlock);
  store.resetIfChainChanged(deployBlock.hash);

  const tokenA = deployment.tokens.A.address.toLowerCase();
  const tokenB = deployment.tokens.B.address.toLowerCase();
  const pool = new ethers.Contract(deployment.pool, POOL_ABI, provider);
  const blockTimes = new Map();

  async function blockTime(number) {
    if (!blockTimes.has(number)) {
      blockTimes.set(number, (await provider.getBlock(number)).timestamp);
    }
    return blockTimes.get(number);
  }

  // 2c. Збереження події у реляційну базу даних
  async function save(log) {
    const { trader, tokenIn, amountIn, amountOut, feeBps } = log.args;
    const tokenInAddr = tokenIn.toLowerCase();
    const isNew = store.insertSwap({
      txHash: log.transactionHash,
      logIndex: log.index,
      blockNumber: log.blockNumber,
      blockTime: await blockTime(log.blockNumber),
      trader: trader.toLowerCase(),
      tokenIn: tokenInAddr,
      tokenOut: tokenInAddr === tokenA ? tokenB : tokenA,
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
      feeBps: Number(feeBps),
    });
    if (isNew) {
      console.log(`Swap збережено: блок ${log.blockNumber}, трейдер ${trader}, tx ${log.transactionHash}`);
    }
  }

  // 2b. Прослуховування нових подій Swap
  pool.on("Swap", (...args) => {
    const payload = args[args.length - 1];
    save(payload.log).catch((e) => console.error("Помилка збереження події:", e.message));
  });

  // Історичні події (якщо сервіс був вимкнений): повторів не буде завдяки UNIQUE(tx_hash, log_index)
  const past = await pool.queryFilter(pool.filters.Swap(), deployment.deployBlock, head);
  for (const log of past) await save(log);
  console.log(`Слухач запущено. Пул ${deployment.pool}. Історичних подій оброблено: ${past.length}`);

  return { provider, pool };
}
