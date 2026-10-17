// Спільні допоміжні функції для скриптів лабораторної роботи №3.
// Працює з локальним вузлом Hardhat (npx hardhat node) через звичайний ethers.js.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEPLOYMENT_FILE = path.join(ROOT, "deployment.json");
export const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";

export const parse = (v) => ethers.parseUnits(String(v), 18);
export const fmt = (v) => ethers.formatUnits(v, 18);
export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Читає ABI та байткод контракту, скомпільованого командою `npx hardhat build`. */
export function loadArtifact(name) {
  const file = path.join(ROOT, "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Не знайдено ${file}. Спочатку виконайте: npx hardhat build`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

/** Розблоковані акаунти локального вузла: 0 - провайдер ліквідності, 1 і 2 - трейдери. */
export async function getSigners(provider, count = 3) {
  const signers = [];
  for (let i = 0; i < count; i++) signers.push(await provider.getSigner(i));
  return signers;
}

export function loadDeployment() {
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    throw new Error("Не знайдено deployment.json. Спочатку виконайте: node scripts/deploy_and_simulate.js");
  }
  return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
}

/** Екземпляри пулу та двох токенів за адресами з deployment.json. */
export function connectContracts(dep, runner) {
  const tokenAbi = loadArtifact("AssetToken").abi;
  const poolAbi = loadArtifact("DexPool").abi;
  return {
    pool: new ethers.Contract(dep.pool, poolAbi, runner),
    tokens: {
      A: new ethers.Contract(dep.tokens.A.address, tokenAbi, runner),
      B: new ethers.Contract(dep.tokens.B.address, tokenAbi, runner),
    },
  };
}

/** Якщо у трейдера мало токенів, провайдер докидає йому по 1000 кожного. */
export async function ensureFunds(ctx, deployer, trader, minAmount = 300) {
  const addr = await trader.getAddress();
  for (const side of ["A", "B"]) {
    const balance = await ctx.tokens[side].balanceOf(addr);
    if (balance < parse(minAmount)) {
      await (await ctx.tokens[side].connect(deployer).transfer(addr, parse(1000))).wait();
    }
  }
}

/**
 * Один обмін: approve -> getAmountOut -> swap.
 * Контракт емітує подію Swap, яку підхоплює бекенд.
 */
export async function runSwap(ctx, dep, signer, symbolIn, amount) {
  const side = symbolIn === dep.tokens.A.symbol ? "A" : "B";
  const other = side === "A" ? "B" : "A";
  const tokenIn = ctx.tokens[side].connect(signer);
  const pool = ctx.pool.connect(signer);
  const amountIn = parse(amount);

  await (await tokenIn.approve(dep.pool, amountIn)).wait();
  const [expectedOut, feeBps] = await pool.getAmountOut(dep.tokens[side].address, amountIn);
  const receipt = await (await pool.swap(dep.tokens[side].address, amountIn, expectedOut)).wait();

  const trader = await signer.getAddress();
  console.log(
    `${short(trader)}: ${amount} ${dep.tokens[side].symbol} -> ${fmt(expectedOut)} ${dep.tokens[other].symbol}` +
      ` | комісія ${Number(feeBps) / 100}% | блок ${receipt.blockNumber} | tx ${short(receipt.hash)}`
  );
}
