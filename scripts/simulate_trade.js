// Лабораторна робота №2: програмна емісія активів та пул ліквідності (CPMM)
// Автор: Вертій Максим Олександрович
// Запуск: node scripts/simulate_trade.js   (або npx hardhat run scripts/simulate_trade.js)
//
// Що робить скрипт (усе в локальній in-memory мережі Hardhat):
//   1. Емісія двох ERC-20 токенів: VertiiCoin (VRT) та MockFiat (MFT).
//   2. Кооперація: переказ 5000 кожного токена партнеру (одногрупнику).
//   3. Розгортання пулу DexPool з динамічною комісією.
//   4. approve -> надання ліквідності 1000 VRT : 2000 MFT (курс 1:2).
//   5. Обмін 50 VRT -> MFT (рівно 5% резерву: базова комісія 0.1%).
//   6. Порівняльний обмін 200 VRT -> MFT (20% резерву: підвищена комісія).

import { network } from "hardhat";

const { ethers } = await network.connect();

const parse = (v) => ethers.parseUnits(String(v), 18);
const fmt = (v) => ethers.formatUnits(v, 18);
const title = (t) => console.log(`\n=== ${t} ===`);

// Для порівняння: класична статична комісія 0.3% (формула 2.2)
function staticOut(amountIn, reserveIn, reserveOut) {
  const inWithFee = amountIn * 997n;
  return (inWithFee * reserveOut) / (reserveIn * 1000n + inWithFee);
}

async function main() {
  const [provider, trader, partner] = await ethers.getSigners();
  // Щоб надіслати токени реальному одногрупнику, підставте його адресу:
  const PARTNER = partner.address;

  // ---------- 1. Емісія активів ----------
  title("1. Емісія цифрових активів ERC-20");
  const AssetToken = await ethers.getContractFactory("AssetToken");

  const vrt = await AssetToken.deploy("VertiiCoin", "VRT", parse(1_000_000));
  await vrt.waitForDeployment();
  const mft = await AssetToken.deploy("MockFiat", "MFT", parse(1_000_000));
  await mft.waitForDeployment();

  const vrtAddr = await vrt.getAddress();
  const mftAddr = await mft.getAddress();
  console.log("VertiiCoin (VRT):", vrtAddr, "| емісія:", fmt(await vrt.totalSupply()));
  console.log("MockFiat   (MFT):", mftAddr, "| емісія:", fmt(await mft.totalSupply()));

  // ---------- 2. Кооперація ----------
  title("2. Кооперація: переказ по 5000 токенів партнеру");
  await (await vrt.transfer(PARTNER, parse(5000))).wait();
  await (await mft.transfer(PARTNER, parse(5000))).wait();
  console.log("Партнер:", PARTNER);
  console.log("Баланс партнера VRT:", fmt(await vrt.balanceOf(PARTNER)));
  console.log("Баланс партнера MFT:", fmt(await mft.balanceOf(PARTNER)));

  // Допоміжна функція: новий пул з ліквідністю 1000 VRT : 2000 MFT
  async function createPool() {
    const DexPool = await ethers.getContractFactory("DexPool");
    const pool = await DexPool.deploy(vrtAddr, mftAddr);
    await pool.waitForDeployment();
    const poolAddr = await pool.getAddress();

    // ---------- 3. Авторизація витрат (approve) ----------
    await (await vrt.approve(poolAddr, parse(100_000))).wait();
    await (await mft.approve(poolAddr, parse(100_000))).wait();

    // ---------- 4. Надання ліквідності (курс 1:2) ----------
    await (await pool.addLiquidity(parse(1000), parse(2000))).wait();
    return pool;
  }

  // Допоміжна функція: обмін VRT -> MFT з детальним звітом
  async function trade(pool, amountVrt) {
    const poolAddr = await pool.getAddress();
    const amountIn = parse(amountVrt);

    const x0 = await pool.reserveA();
    const y0 = await pool.reserveB();
    console.log(`Резерви до обміну: x = ${fmt(x0)} VRT, y = ${fmt(y0)} MFT`);
    console.log(`Константа k до обміну: ${fmt(x0 * y0 / parse(1))}`);

    // трейдеру потрібні токени та approve
    await (await vrt.transfer(trader.address, amountIn)).wait();
    await (await vrt.connect(trader).approve(poolAddr, amountIn)).wait();

    const [expectedOut, feeBps] = await pool.getAmountOut(vrtAddr, amountIn);
    const share = (amountIn * 10000n) / x0;
    console.log(
      `Обсяг угоди: ${amountVrt} VRT = ${Number(share) / 100}% резерву -> комісія ${Number(feeBps) / 100}% (${feeBps} bps)`
    );

    const before = await mft.balanceOf(trader.address);
    await (await pool.connect(trader).swap(vrtAddr, amountIn, expectedOut)).wait();
    const received = (await mft.balanceOf(trader.address)) - before;

    const x1 = await pool.reserveA();
    const y1 = await pool.reserveB();
    console.log(`Трейдер продав ${amountVrt} VRT і отримав: ${fmt(received)} MFT`);
    console.log(`Без AMM за курсом 1:2 було б: ${Number(amountVrt) * 2} MFT`);
    console.log(`Ефективний курс: ${(Number(fmt(received)) / Number(amountVrt)).toFixed(6)} MFT за 1 VRT`);
    console.log(`Статична комісія 0.3% дала б: ${fmt(staticOut(amountIn, x0, y0))} MFT`);
    console.log(`Резерви після обміну: x = ${fmt(x1)} VRT, y = ${fmt(y1)} MFT`);
    console.log(`Константа k після обміну: ${fmt(x1 * y1 / parse(1))} (зросла завдяки комісії)`);
    console.log(`k не зменшилась: ${x1 * y1 >= x0 * y0}`);
    return received;
  }

  // ---------- 5. Обмін 50 VRT (5% резерву) ----------
  title("3-4. Пул VRT/MFT: approve та ліквідність 1000 VRT : 2000 MFT");
  const pool1 = await createPool();
  console.log("Адреса пулу:", await pool1.getAddress());
  console.log("Початковий курс: 1 VRT = 2 MFT");

  title("5. Обмін 50 VRT -> MFT (базова комісія)");
  await trade(pool1, 50);

  // ---------- 6. Великий обмін для порівняння ----------
  title("6. Порівняння: обмін 200 VRT -> MFT (підвищена комісія)");
  const pool2 = await createPool();
  await trade(pool2, 200);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
