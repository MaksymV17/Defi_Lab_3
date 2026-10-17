import { useCallback, useEffect, useState } from "react";
import "./App.css";

// Порожній рядок = той самий домен, запити йдуть через проксі Vite на бекенд
const API = import.meta.env.VITE_API_URL ?? "";
const REFRESH_MS = 5000;

const shorten = (s, head = 6, tail = 4) => `${s.slice(0, head)}…${s.slice(-tail)}`;
const num = (v, digits = 4) =>
  Number(v).toLocaleString("uk-UA", { maximumFractionDigits: digits });
const time = (iso) => new Date(iso).toLocaleString("uk-UA");

export default function App() {
  const [account, setAccount] = useState(null);
  const [swaps, setSwaps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const walletAvailable = typeof window !== "undefined" && Boolean(window.ethereum);

  // 3a. Підключення гаманця через window.ethereum
  const connect = useCallback(async () => {
    setError("");
    if (!window.ethereum) {
      setError("Гаманець не знайдено. Встановіть MetaMask.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0] ?? null);
    } catch (e) {
      setError(e?.code === 4001 ? "Підключення скасовано користувачем." : e.message);
    }
  }, []);

  // Якщо сайт уже має дозвіл - підключаємось автоматично; слідкуємо за зміною акаунта
  useEffect(() => {
    if (!walletAvailable) return;
    const onAccounts = (accounts) => setAccount(accounts[0] ?? null);

    window.ethereum
      .request({ method: "eth_accounts" })
      .then(onAccounts)
      .catch(() => {});
    window.ethereum.on?.("accountsChanged", onAccounts);
    return () => window.ethereum.removeListener?.("accountsChanged", onAccounts);
  }, [walletAvailable]);

  // 3b. Історія обмінів підключеного користувача: HTTP-запит до бекенду
  const loadSwaps = useCallback(async (address) => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/swaps/${address}`);
      if (!response.ok) throw new Error(`Бекенд відповів кодом ${response.status}`);
      const data = await response.json();
      setSwaps(data.swaps);
      setError("");
    } catch (e) {
      setError(`Не вдалося отримати дані з бекенду: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!account) {
      setSwaps([]);
      return;
    }
    loadSwaps(account);
    const timer = setInterval(() => loadSwaps(account), REFRESH_MS);
    return () => clearInterval(timer);
  }, [account, loadSwaps]);

  return (
    <main className="page">
      <header className="top">
        <div>
          <h1>Історія обмінів</h1>
          <p className="muted">DexPool · пара VRT / MFT · події Swap з бази даних бекенду</p>
        </div>

        {account ? (
          <div className="account" title={account}>
            <span className="dot" />
            {shorten(account)}
          </div>
        ) : (
          <button className="connect" onClick={connect}>
            Підключити гаманець
          </button>
        )}
      </header>

      {error && <div className="alert">{error}</div>}

      {!account && !error && (
        <p className="empty">Підключіть гаманець, щоб побачити свої обміни.</p>
      )}

      {account && (
        <section>
          <div className="bar">
            <span className="muted">
              Записів: <b>{swaps.length}</b>
            </span>
            <button className="ghost" onClick={() => loadSwaps(account)} disabled={loading}>
              {loading ? "Оновлення…" : "Оновити"}
            </button>
          </div>

          {swaps.length === 0 ? (
            <p className="empty">Для цього гаманця обмінів ще немає.</p>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Час</th>
                    <th>Блок</th>
                    <th>Транзакція</th>
                    <th className="r">Продано</th>
                    <th className="r">Отримано</th>
                    <th className="r">Курс</th>
                    <th className="r">Комісія</th>
                  </tr>
                </thead>
                <tbody>
                  {swaps.map((s) => (
                    <tr key={s.txHash + s.blockNumber}>
                      <td>{time(s.timestamp)}</td>
                      <td>{s.blockNumber}</td>
                      <td className="mono" title={s.txHash}>
                        {shorten(s.txHash, 8, 6)}
                      </td>
                      <td className="r">
                        {num(s.amountIn)} <b>{s.tokenIn.symbol}</b>
                      </td>
                      <td className="r">
                        {num(s.amountOut)} <b>{s.tokenOut.symbol}</b>
                      </td>
                      <td className="r">{num(s.rate, 4)}</td>
                      <td className="r">{num(s.feePercent, 2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
