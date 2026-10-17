// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DexPool
/// @notice Пул ліквідності на моделі константного добутку (CPMM, x * y = k)
///         з ДИНАМІЧНОЮ комісією, яка залежить від розміру угоди відносно резерву.
///
/// Комісія (у базисних пунктах, 1 bps = 0.01%):
///   impact = amountIn / reserveIn   (частка угоди від резерву)
///   impact <= 5%        -> 0.10%   (базова ставка, множник 9990/10000 = 999/1000)
///   5% < impact < 25%   -> лінійно від 1% до 5%
///   impact >= 25%       -> 5%      (верхня межа)
///
/// Формула обміну (f = 1 - fee):
///   amountOut = (amountIn * f * reserveOut) / (reserveIn + amountIn * f)
contract DexPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------- Токени та резерви (змінні x та y з формули 2.1) ----------
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    uint256 public reserveA;
    uint256 public reserveB;

    // ---------- Параметри динамічної комісії ----------
    uint256 public constant FEE_DENOMINATOR = 10_000; // 100% = 10 000 bps
    uint256 public constant BASE_FEE_BPS = 10; //   0.10%
    uint256 public constant IMPACT_THRESHOLD_BPS = 500; //   5% від резерву
    uint256 public constant PENALTY_FEE_BPS = 100; //   1%   одразу після порогу
    uint256 public constant MAX_FEE_BPS = 500; //   5%   верхня межа
    uint256 public constant MAX_IMPACT_BPS = 2_500; //  25% від резерву

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB);
    event Swap(
        address indexed trader,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeBps
    );

    constructor(address _tokenA, address _tokenB) {
        require(_tokenA != address(0) && _tokenB != address(0), "Pool: zero address");
        require(_tokenA != _tokenB, "Pool: identical tokens");
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    // ---------- Надання ліквідності ----------

    /// @notice Провайдер вносить обидва токени. Потрібен попередній approve у контрактах токенів.
    function addLiquidity(uint256 amountA, uint256 amountB) external nonReentrant {
        require(amountA > 0 && amountB > 0, "Pool: zero amount");

        reserveA += amountA;
        reserveB += amountB;

        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
        tokenB.safeTransferFrom(msg.sender, address(this), amountB);

        emit LiquidityAdded(msg.sender, amountA, amountB);
    }

    // ---------- Динамічна комісія ----------

    /// @notice Комісія в bps залежно від частки угоди у резерві вхідного токена.
    function getFeeBps(uint256 amountIn, uint256 reserveIn) public pure returns (uint256) {
        require(reserveIn > 0, "Pool: no liquidity");

        uint256 impactBps = (amountIn * FEE_DENOMINATOR) / reserveIn;

        if (impactBps <= IMPACT_THRESHOLD_BPS) {
            return BASE_FEE_BPS;
        }
        if (impactBps >= MAX_IMPACT_BPS) {
            return MAX_FEE_BPS;
        }
        // лінійна інтерполяція від 1% (на порозі) до 5% (на межі 25%)
        return
            PENALTY_FEE_BPS +
            ((impactBps - IMPACT_THRESHOLD_BPS) * (MAX_FEE_BPS - PENALTY_FEE_BPS)) /
            (MAX_IMPACT_BPS - IMPACT_THRESHOLD_BPS);
    }

    // ---------- Розрахунок обміну ----------

    /// @notice Скільки токена на виході отримає трейдер і яка комісія буде застосована.
    function getAmountOut(address tokenIn, uint256 amountIn)
        public
        view
        returns (uint256 amountOut, uint256 feeBps)
    {
        require(amountIn > 0, "Pool: zero amount");
        (uint256 reserveIn, uint256 reserveOut) = _reservesFor(tokenIn);
        require(reserveIn > 0 && reserveOut > 0, "Pool: no liquidity");

        feeBps = getFeeBps(amountIn, reserveIn);

        // EVM не має дробів: замість множення на 0.999 множимо на (10000 - fee) і ділимо на 10000
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - feeBps);
        amountOut =
            (amountInWithFee * reserveOut) /
            (reserveIn * FEE_DENOMINATOR + amountInWithFee);
    }

    // ---------- Обмін ----------

    /// @notice Обмін одного токена пулу на інший за формулою константного добутку.
    /// @param tokenIn       адреса токена, який трейдер продає
    /// @param amountIn      сума, що віддається
    /// @param minAmountOut  захист від проковзування: мінімально прийнятна сума на виході
    function swap(
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut
    ) external nonReentrant returns (uint256 amountOut) {
        uint256 feeBps;
        (amountOut, feeBps) = getAmountOut(tokenIn, amountIn);
        require(amountOut > 0, "Pool: insufficient output");
        require(amountOut >= minAmountOut, "Pool: slippage too high");

        bool aToB = tokenIn == address(tokenA);
        IERC20 tIn = aToB ? tokenA : tokenB;
        IERC20 tOut = aToB ? tokenB : tokenA;

        // Спочатку оновлюємо стан (повна сума amountIn, разом з комісією, лишається в пулі)
        if (aToB) {
            reserveA += amountIn;
            reserveB -= amountOut;
        } else {
            reserveB += amountIn;
            reserveA -= amountOut;
        }

        tIn.safeTransferFrom(msg.sender, address(this), amountIn);
        tOut.safeTransfer(msg.sender, amountOut);

        emit Swap(msg.sender, tokenIn, amountIn, amountOut, feeBps);
    }

    // ---------- Внутрішнє ----------

    function _reservesFor(address tokenIn)
        internal
        view
        returns (uint256 reserveIn, uint256 reserveOut)
    {
        if (tokenIn == address(tokenA)) {
            return (reserveA, reserveB);
        }
        require(tokenIn == address(tokenB), "Pool: unknown token");
        return (reserveB, reserveA);
    }
}
