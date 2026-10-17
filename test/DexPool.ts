import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { network } from "hardhat";

const { ethers } = await network.connect();

const parse = (v: number | string) => ethers.parseUnits(String(v), 18);

describe("DexPool: динамічна комісія та константний добуток", () => {
  let provider: any, trader: any;
  let vrt: any, mft: any, pool: any;
  let vrtAddr: string, mftAddr: string;

  beforeEach(async () => {
    [provider, trader] = await ethers.getSigners();

    const AssetToken = await ethers.getContractFactory("AssetToken");
    vrt = await AssetToken.deploy("VertiiCoin", "VRT", parse(1_000_000));
    mft = await AssetToken.deploy("MockFiat", "MFT", parse(1_000_000));
    vrtAddr = await vrt.getAddress();
    mftAddr = await mft.getAddress();

    const DexPool = await ethers.getContractFactory("DexPool");
    pool = await DexPool.deploy(vrtAddr, mftAddr);
    const poolAddr = await pool.getAddress();

    await vrt.approve(poolAddr, parse(100_000));
    await mft.approve(poolAddr, parse(100_000));
    await pool.addLiquidity(parse(1000), parse(2000));

    await vrt.transfer(trader.address, parse(1000));
    await vrt.connect(trader).approve(poolAddr, parse(1000));
  });

  it("ліквідність формує курс 1:2", async () => {
    assert.equal(await pool.reserveA(), parse(1000));
    assert.equal(await pool.reserveB(), parse(2000));
  });

  it("дрібна угода та рівно 5% резерву: базова комісія 0.1% (10 bps)", async () => {
    assert.equal(await pool.getFeeBps(parse(1), parse(1000)), 10n);
    assert.equal(await pool.getFeeBps(parse(50), parse(1000)), 10n);
  });

  it("угода понад 5% резерву: комісія 1-5%, зростає з обсягом", async () => {
    const f10 = await pool.getFeeBps(parse(100), parse(1000)); // 10% резерву
    const f20 = await pool.getFeeBps(parse(200), parse(1000)); // 20% резерву
    assert.equal(f10, 200n); // 2%
    assert.equal(f20, 400n); // 4%
    assert.ok(f20 > f10);
  });

  it("угода від 25% резерву: комісія обмежена зверху 5% (500 bps)", async () => {
    assert.equal(await pool.getFeeBps(parse(250), parse(1000)), 500n);
    assert.equal(await pool.getFeeBps(parse(900), parse(1000)), 500n);
  });

  it("обмін 50 VRT дає суму за формулою з множником 9990/10000", async () => {
    const amountIn = parse(50);
    const inWithFee = amountIn * 9990n;
    const expected = (inWithFee * parse(2000)) / (parse(1000) * 10000n + inWithFee);

    const before = await mft.balanceOf(trader.address);
    await pool.connect(trader).swap(vrtAddr, amountIn, 0n);
    const received = (await mft.balanceOf(trader.address)) - before;

    assert.equal(received, expected);
    assert.equal(received, 95147387970855755035n);
  });

  it("константа k не зменшується після обміну (комісія її збільшує)", async () => {
    const k0 = (await pool.reserveA()) * (await pool.reserveB());
    await pool.connect(trader).swap(vrtAddr, parse(50), 0n);
    const k1 = (await pool.reserveA()) * (await pool.reserveB());
    assert.ok(k1 >= k0);
  });

  it("обмін у зворотний бік (MFT -> VRT) теж працює", async () => {
    const poolAddr = await pool.getAddress();
    await mft.transfer(trader.address, parse(100));
    await mft.connect(trader).approve(poolAddr, parse(100));

    const before = await vrt.balanceOf(trader.address);
    await pool.connect(trader).swap(mftAddr, parse(100), 0n);
    assert.ok((await vrt.balanceOf(trader.address)) > before);
  });

  it("revert: нульова сума, невідомий токен, захист від проковзування", async () => {
    await assert.rejects(pool.connect(trader).swap(vrtAddr, 0n, 0n));
    await assert.rejects(pool.connect(trader).swap(provider.address, parse(1), 0n));
    await assert.rejects(pool.connect(trader).swap(vrtAddr, parse(50), parse(1000)));
  });
});
