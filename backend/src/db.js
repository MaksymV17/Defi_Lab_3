// Реляційна база даних SQLite (вбудований модуль node:sqlite, Node.js 22.13+).
import { DatabaseSync } from "node:sqlite";

export function openStore(file) {
  const db = new DatabaseSync(file);

  db.exec(`
    CREATE TABLE IF NOT EXISTS swaps (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash      TEXT    NOT NULL,
      log_index    INTEGER NOT NULL,
      block_number INTEGER NOT NULL,
      block_time   INTEGER NOT NULL,   -- unix-час блоку, секунди
      trader       TEXT    NOT NULL,   -- адреса трейдера (нижній регістр)
      token_in     TEXT    NOT NULL,   -- адреса проданого токена
      token_out    TEXT    NOT NULL,   -- адреса отриманого токена
      amount_in    TEXT    NOT NULL,   -- у мінімальних одиницях (wei), рядком
      amount_out   TEXT    NOT NULL,
      fee_bps      INTEGER NOT NULL,   -- комісія в базисних пунктах (10 = 0.1%)
      UNIQUE (tx_hash, log_index)      -- одна подія зберігається лише раз
    );
    CREATE INDEX IF NOT EXISTS idx_swaps_trader ON swaps (trader, block_number DESC);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO swaps
      (tx_hash, log_index, block_number, block_time, trader, token_in, token_out, amount_in, amount_out, fee_bps)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const byTrader = db.prepare(`
    SELECT * FROM swaps WHERE trader = ?
    ORDER BY block_number DESC, log_index DESC LIMIT ?
  `);
  const countAll = db.prepare("SELECT COUNT(*) AS n FROM swaps");
  const getMeta = db.prepare("SELECT value FROM meta WHERE key = ?");
  const setMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");

  return {
    /** Повертає true, якщо запис новий (а не дублікат). */
    insertSwap(s) {
      const result = insert.run(
        s.txHash, s.logIndex, s.blockNumber, s.blockTime, s.trader,
        s.tokenIn, s.tokenOut, s.amountIn, s.amountOut, s.feeBps
      );
      return result.changes > 0;
    },
    getSwapsByTrader(trader, limit = 200) {
      return byTrader.all(trader.toLowerCase(), limit);
    },
    count() {
      return countAll.get().n;
    },
    /**
     * Якщо локальний вузол перезапускали й контракти розгорнули заново,
     * хеш блоку розгортання зміниться - тоді старі записи видаляємо.
     */
    resetIfChainChanged(deployBlockHash) {
      const saved = getMeta.get("deploy_block_hash")?.value;
      if (saved && saved !== deployBlockHash) {
        db.exec("DELETE FROM swaps");
        console.log("Виявлено новий ланцюжок: стару історію очищено.");
      }
      setMeta.run("deploy_block_hash", deployBlockHash);
    },
  };
}
