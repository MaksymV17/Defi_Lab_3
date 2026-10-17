import cors from "cors";
import express from "express";
import { ethers } from "ethers";

export function createApp({ store, deployment }) {
  const app = express();
  app.use(cors());

  const tokenByAddress = new Map(
    Object.values(deployment.tokens).map((t) => [t.address.toLowerCase(), t])
  );
  const describe = (address) => {
    const t = tokenByAddress.get(address);
    return { address, symbol: t?.symbol ?? "?", decimals: t?.decimals ?? 18 };
  };

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", pool: deployment.pool, chainId: deployment.chainId, swapsTotal: store.count() });
  });

  app.get("/api/config", (_req, res) => {
    res.json({ pool: deployment.pool, chainId: deployment.chainId, tokens: deployment.tokens });
  });

  // 2d. Збережені записи конкретного користувача
  app.get("/api/swaps/:address", (req, res) => {
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Некоректна Ethereum-адреса" });
    }
    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    const swaps = store.getSwapsByTrader(address, limit).map((row) => {
      const tokenIn = describe(row.token_in);
      const tokenOut = describe(row.token_out);
      const amountIn = ethers.formatUnits(row.amount_in, tokenIn.decimals);
      const amountOut = ethers.formatUnits(row.amount_out, tokenOut.decimals);
      return {
        txHash: row.tx_hash,
        blockNumber: row.block_number,
        timestamp: new Date(row.block_time * 1000).toISOString(),
        trader: row.trader,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        rate: Number(amountOut) / Number(amountIn),
        feePercent: row.fee_bps / 100,
      };
    });

    res.json({ address: address.toLowerCase(), count: swaps.length, swaps });
  });

  return app;
}
