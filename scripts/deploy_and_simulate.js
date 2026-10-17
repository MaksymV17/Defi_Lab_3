// Лабораторна робота №3: розгортання оновленого пулу та генерація подій Swap
// Автор: Вертій Максим Олександрович
//
// Передумови: запущено локальний вузол (npx hardhat node) і виконано npx hardhat build.
// Запуск:     node scripts/deploy_and_simulate.js
//
// Що робить скрипт:
//   1. Розгортає токени VertiiCoin (VRT) та MockFiat (MFT) і пул DexPool (з подією Swap).
//   2. Надає ліквідність 1000 VRT : 2000 MFT.
//   3. Видає двом трейдерам по 1000 токенів кожного виду.
//   4. Виконує кілька обмінів - кожен емітує подію Swap.
//   5. Записує адреси у deployment.json (їх читають бекенд і фронтенд).

import fs from "node:fs";
import { ethers } from "ethers";
import {
  DEPLOYMENT_FILE,
  RPC_URL,
  connectContracts,
  getProvider,
  getSigners,
  loadArtifact,
  parse,
  runSwap,
} from "./chain.js";

const title = (t) => console.log(`\n=== ${t} ===`);

async function deploy(name, signer, args) {
  const artifact = loadArtifact(name);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function main() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  const [deployer, trader1, trader2] = await getSigners(provider, 3);
  const startBlock = await provider.getBlockNumber();

  title("1. Розгортання токенів і пулу");
  const vrt = await deploy("AssetToken", deployer, ["VertiiCoin", "VRT", parse(1_000_000)]);
  const mft = await deploy("AssetToken", deployer, ["MockFiat", "MFT", parse(1_000_000)]);
  const vrtAddr = await vrt.getAddress();
  const mftAddr = await mft.getAddress();
  const pool = await deploy("DexPool", deployer, [vrtAddr, mftAddr]);
  const poolAddr = await pool.getAddress();
  console.log("Мережа:            ", `chainId ${network.chainId}`, `(${RPC_URL})`);
  console.log("VertiiCoin (VRT):  ", vrtAddr);
  console.log("MockFiat   (MFT):  ", mftAddr);
  console.log("DexPool:           ", poolAddr);

  title("2. approve та ліквідність 1000 VRT : 2000 MFT");
  await (await vrt.approve(poolAddr, parse(100_000))).wait();
  await (await mft.approve(poolAddr, parse(100_000))).wait();
  await (await pool.addLiquidity(parse(1000), parse(2000))).wait();
  console.log("Резерви пулу: 1000 VRT та 2000 MFT (курс 1:2)");

  title("3. Видача токенів трейдерам");
  const addr1 = await trader1.getAddress();
  const addr2 = await trader2.getAddress();
  for (const to of [addr1, addr2]) {
    await (await vrt.transfer(to, parse(1000))).wait();
    await (await mft.transfer(to, parse(1000))).wait();
    console.log(`${to}: 1000 VRT + 1000 MFT`);
  }

  const deployment = {
    rpcUrl: RPC_URL,
    chainId: Number(network.chainId),
    deployBlock: startBlock,
    pool: poolAddr,
    tokens: {
      A: { name: "VertiiCoin", symbol: "VRT", address: vrtAddr, decimals: 18 },
      B: { name: "MockFiat", symbol: "MFT", address: mftAddr, decimals: 18 },
    },
    accounts: { deployer: await deployer.getAddress(), trader1: addr1, trader2: addr2 },
  };
  fs.writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2));
  console.log("\nАдреси збережено у deployment.json");

  title("4. Тестові обміни (кожен емітує подію Swap)");
  const ctx = connectContracts(deployment, provider);
  await runSwap(ctx, deployment, trader1, "VRT", 50);
  await runSwap(ctx, deployment, trader1, "VRT", 20);
  await runSwap(ctx, deployment, trader2, "VRT", 200);
  await runSwap(ctx, deployment, trader1, "MFT", 100);
  await runSwap(ctx, deployment, trader2, "MFT", 30);

  const [x, y] = [await pool.reserveA(), await pool.reserveB()];
  console.log(`\nРезерви пулу після обмінів: ${ethers.formatUnits(x, 18)} VRT, ${ethers.formatUnits(y, 18)} MFT`);
  console.log("\nГотово. Далі: запустіть бекенд (backend) і фронтенд (frontend).");
  console.log("Акаунти трейдерів для MetaMask:");
  console.log("  trader1:", addr1);
  console.log("  trader2:", addr2);
}

main().catch((error) => {
  console.error("Помилка:", error.shortMessage ?? error.message);
  process.exit(1);
});
