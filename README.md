# Лабораторна робота №3: індексація подій Swap (бекенд + React)

Автор: Вертій Максим Олександрович

Пул `DexPool` з лаби 2 емітує подію `Swap(trader, tokenIn, amountIn, amountOut, feeBps)`.
Бекенд слухає цю подію, зберігає її в SQLite і віддає через REST. React-інтерфейс
показує історію обмінів підключеного гаманця.

```
dev-2/                     проєкт Hardhat з лаби 2
├── contracts/              (AssetToken.sol, DexPool.sol - без змін)
├── scripts/
│   ├── chain.js            спільні функції
│   ├── deploy_and_simulate.js   розгортання + тестові обміни -> deployment.json
│   └── make_swaps.js       додаткові обміни (запускати, поки працює бекенд)
├── backend/                Node.js + ethers + SQLite + Express (REST API)
└── frontend/               React + Vite (MetaMask + таблиця історії)
```

## Запуск (4 термінали, усі в папці `dev-2`)

**Термінал 1: локальний вузол**
```
npx hardhat node
```

**Термінал 2: розгортання й тестові обміни** (контракти мають бути зібрані: `npx hardhat build`)
```
node scripts/deploy_and_simulate.js
```

**Термінал 3: бекенд**
```
cd backend
npm install
npm start
```
Перевірка: http://localhost:3001/api/health та
`http://localhost:3001/api/swaps/<адреса трейдера>`

**Термінал 4: фронтенд**
```
cd frontend
npm install
npm run dev
```
Відкрийте http://localhost:5173

## MetaMask

1. Додайте мережу: RPC `http://127.0.0.1:8545`, Chain ID `31337`, символ `ETH`.
2. Імпортуйте акаунт трейдера. Приватні ключі тестових акаунтів виводить `npx hardhat node`
   (акаунти #1 та #2 це trader1 та trader2). Ці ключі публічно відомі, лише для локальної розробки.
3. На сайті натисніть «Підключити гаманець».

Щоб побачити, як нові події з'являються в таблиці (оновлення раз на 5 с), виконайте
`node scripts/make_swaps.js 3`, поки працюють бекенд і фронтенд.

## REST API

| Метод | Адреса | Опис |
|-------|--------|------|
| GET | `/api/swaps/:address` | Збережені обміни користувача (нові зверху), `?limit=200` |
| GET | `/api/health` | Стан сервісу та кількість записів у БД |
| GET | `/api/config` | Адреса пулу та токенів |
