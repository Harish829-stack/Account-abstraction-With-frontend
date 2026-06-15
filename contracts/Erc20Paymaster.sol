// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/core/UserOperationLib.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title  MultiTokenPaymaster
 * @notice ERC-4337 Paymaster accepting USDC, USDT, and DAI as gas payment.
 *         Compatible with Skandha public bundler on Sepolia.
 *
 * ── Validation phase (EIP-7562 compliant) ────────────────────────────────────
 *
 *  Skandha simulates validatePaymasterUserOp under strict opcode/storage rules:
 *    - NO calls to unstaked external contracts (Chainlink is unstaked → banned)
 *    - NO banned opcodes (TIMESTAMP, NUMBER, BLOCKHASH, etc.)
 *    - Storage reads allowed only from: EntryPoint, this paymaster, sender account
 *
 *  Therefore validatePaymasterUserOp:
 *    - Uses only OUR OWN storage (tokenConfigs, maxEthPriceUsd, ETH_USD_FEED_DECIMALS)
 *    - Does NOT call ethUsdFeed.decimals() or ethUsdFeed.latestRoundData()
 *    - Uses a hardcoded `maxEthPriceUsd` ceiling for worst-case pre-charge
 *    - Pre-charges tokens via safeTransferFrom (closes TOCTOU window)
 *
 * ── Execution phase (postOp) ─────────────────────────────────────────────────
 *
 *  postOp runs on-chain after the UserOp executes. External calls are allowed:
 *    - Calls Chainlink latestRoundData() to get the real ETH/USD price
 *    - Computes exact token cost from actualGasCost
 *    - Refunds surplus (preCharge - actualCost) to user
 *
 * ── postOpReverted handling ──────────────────────────────────────────────────
 *
 *  If postOp itself reverts (e.g. Chainlink feed is stale), EntryPoint calls
 *  postOp again with mode = postOpReverted. At that point tokens are already
 *  held by us from the pre-charge. We return early and keep the preCharge as
 *  the fee. No second transfer attempt — avoids double-charging.
 *
 * ── paymasterAndData layout ──────────────────────────────────────────────────
 *
 *  [0  : 20]  paymaster address   (added by SDK)
 *  [20 : 40]  token address       (USDC / USDT / DAI)
 *
 * ── Sepolia addresses ────────────────────────────────────────────────────────
 *
 *  EntryPoint v0.7  : 0x0000000071727De22E5E9d8BAf0edAc6f37da032
 *  ETH/USD feed     : 0x694AA1769357215DE4FAC081bf1f309aDC325306  (8 decimals)
 */
contract MultiTokenPaymaster is IPaymaster, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using UserOperationLib for PackedUserOperation;

    // ── Constants ──────────────────────────────────────────────────────────────

    /// @dev 10% markup: buffers ETH price movement between validate and postOp.
    uint256 public constant PRICE_MARKUP      = 110;
    uint256 public constant PRICE_DENOMINATOR = 100;

    /// @dev Chainlink answer rejected if older than this (checked in postOp only).
    uint256 public constant MAX_PRICE_AGE = 1 hours;

    /// @dev Returned in validationData to signal rejection without reverting.
    ///      Bundler reads this and drops the op at simulation time.
    uint256 private constant SIG_VALIDATION_FAILED = 1;

    /**
     * @dev Decimal precision of the Chainlink ETH/USD feed.
     *
     *      Stored as an immutable so validatePaymasterUserOp can use it without
     *      making an external call to the (unstaked) Chainlink contract.
     *
     *      Chainlink USD feeds have used 8 decimals since launch and this has
     *      never changed. If Anthropic ever deployed a new feed with different
     *      decimals, the owner would deploy a new paymaster anyway.
     *
     *      Set once in constructor from ethUsdFeed.decimals() — a one-time
     *      setup call, not a hot-path call — and stored here for validation reuse.
     */
    uint8 public immutable ETH_USD_FEED_DECIMALS;

    // ── Immutables ─────────────────────────────────────────────────────────────

    IEntryPoint public immutable entryPoint;

    // ── Storage ────────────────────────────────────────────────────────────────

    /// @notice Chainlink ETH/USD feed (called only in postOp).
    /// Sepolia: 0x694AA1769357215DE4FAC081bf1f309aDC325306
    AggregatorV3Interface public ethUsdFeed;

    /**
     * @notice ETH price ceiling used during validation (no Chainlink allowed there).
     *         Expressed in USD with ETH_USD_FEED_DECIMALS implicit decimal places.
     *
     *         Default: $10 000 @ 8 decimals = 10_000 * 1e8 = 1_000_000_000_000
     *
     *         If ETH rises above this, users with only enough tokens for the
     *         real price will be rejected at validation. Raise before ETH hits $10k.
     *         Setting it higher than needed just means a larger temporary pre-charge
     *         (refunded in postOp) — no funds are lost.
     */
    uint256 public maxEthPriceUsd = 10_000 * 1e8;

    struct TokenConfig {
        bool  enabled;
        uint8 decimals; // cached from IERC20Metadata — no external call in hot path
    }

    mapping(address => TokenConfig) public tokenConfigs;
    address[] public supportedTokens;

    // ── Events ─────────────────────────────────────────────────────────────────

    event TokenAdded(address indexed token, uint8 decimals);
    event TokenEnabled(address indexed token, bool enabled);
    event EthUsdFeedUpdated(address indexed newFeed);
    event MaxEthPriceUpdated(uint256 newMaxPrice);
    event TokensWithdrawn(address indexed token, address indexed to, uint256 amount);
    event Deposited(uint256 amount);

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(
        IEntryPoint _entryPoint,
        address     _ethUsdFeed
    ) Ownable(msg.sender) {
        require(address(_entryPoint) != address(0), "PM: zero entryPoint");
        require(_ethUsdFeed          != address(0), "PM: zero feed");

        entryPoint = _entryPoint;
        ethUsdFeed = AggregatorV3Interface(_ethUsdFeed);

        // One-time setup call — allowed here, not in the validation hot path.
        // Stores feed decimals as immutable so validatePaymasterUserOp can
        // read them from our own bytecode without touching Chainlink.
        ETH_USD_FEED_DECIMALS = AggregatorV3Interface(_ethUsdFeed).decimals();
    }

    // ── Token management (owner) ───────────────────────────────────────────────

    /// @notice Register a USD-pegged ERC-20 as an accepted payment token.
    function addToken(address token) external onlyOwner {
        require(token != address(0),          "PM: zero token");
        require(!tokenConfigs[token].enabled, "PM: already added");

        uint8 dec = IERC20Metadata(token).decimals();
        tokenConfigs[token] = TokenConfig({ enabled: true, decimals: dec });
        supportedTokens.push(token);
        emit TokenAdded(token, dec);
    }

    /// @notice Pause or resume a token without removing it.
    function setTokenEnabled(address token, bool enabled) external onlyOwner {
        require(tokenConfigs[token].decimals > 0, "PM: unknown token");
        tokenConfigs[token].enabled = enabled;
        emit TokenEnabled(token, enabled);
    }

    /**
     * @notice Point the paymaster at a new ETH/USD feed.
     * @dev    If the new feed has different decimals, deploy a new paymaster —
     *         ETH_USD_FEED_DECIMALS is immutable and cannot be updated.
     */
    function setEthUsdFeed(address feed) external onlyOwner {
        require(feed != address(0), "PM: zero feed");
        require(
            AggregatorV3Interface(feed).decimals() == ETH_USD_FEED_DECIMALS,
            "PM: feed decimals mismatch"
        );
        ethUsdFeed = AggregatorV3Interface(feed);
        emit EthUsdFeedUpdated(feed);
    }

    /**
     * @notice Update the ETH price ceiling used in validation.
     * @param  _maxPrice  USD price with feed decimals (e.g. $15k → 15_000 * 1e8).
     */
    function setMaxEthPriceUsd(uint256 _maxPrice) external onlyOwner {
        require(_maxPrice > 0, "PM: zero price");
        maxEthPriceUsd = _maxPrice;
        emit MaxEthPriceUpdated(_maxPrice);
    }

    // ── IPaymaster ─────────────────────────────────────────────────────────────

    /**
     * @notice Called by EntryPoint during UserOp verification.
     *
     * EIP-7562 compliant — uses ONLY:
     *   • msg.sender check (EntryPoint, always allowed)
     *   • Our own storage: tokenConfigs, maxEthPriceUsd
     *   • Our own immutable: ETH_USD_FEED_DECIMALS
     *   • safeTransferFrom on the user's chosen token (sender-associated storage)
     *
     * No external calls to unstaked contracts. No banned opcodes.
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == address(entryPoint), "PM: only EntryPoint");

        // ── 1. Parse chosen token from paymasterAndData ────────────────────
        bytes calldata pmData = userOp.paymasterAndData;
        if (pmData.length < 40) {
            return ("", SIG_VALIDATION_FAILED);
        }
        address chosenToken = address(bytes20(pmData[20:40]));

        // ── 2. Check token is supported (reads OUR storage only) ──────────
        TokenConfig storage cfg = tokenConfigs[chosenToken];
        if (!cfg.enabled) {
            return ("", SIG_VALIDATION_FAILED);
        }

        // ── 3. Compute worst-case token cost (no Chainlink call) ──────────
        //
        //  Uses:
        //    maxEthPriceUsd      — our own storage slot
        //    ETH_USD_FEED_DECIMALS — our own immutable (bytecode)
        //    cfg.decimals          — our own storage slot
        //
        //  All reads are from THIS contract's storage. EIP-7562 compliant.
        uint256 worstCaseTokenCost = _calculateTokenAmount(
            maxCost,
            cfg.decimals,
            maxEthPriceUsd,
            ETH_USD_FEED_DECIMALS   // ← immutable, NOT ethUsdFeed.decimals()
        );

        // ── 4. Pre-charge user upfront (closes TOCTOU window) ─────────────
        //
        //  safeTransferFrom touches the token contract's storage for
        //  `userOp.sender` — this is the sender-associated slot, permitted
        //  by EIP-7562 rule §4 (paymaster may access sender's token balance).
        //
        //  If balance or allowance is insufficient this reverts, and the
        //  EntryPoint rejects the op cleanly without reverting the bundle.
        IERC20(chosenToken).safeTransferFrom(
            userOp.sender,
            address(this),
            worstCaseTokenCost
        );

        // Encode preCharge so postOp knows how much to refund.
        context = abi.encode(userOp.sender, chosenToken, worstCaseTokenCost);
        return (context, 0); // 0 = sig valid, no time-range restriction
    }

    /**
     * @notice Called by EntryPoint after the UserOp executes.
     *
     *  mode == opSucceeded | opReverted:
     *    Fetch real ETH/USD price, compute exact cost, refund surplus.
     *
     *  mode == postOpReverted:
     *    Our first postOp call failed (e.g. Chainlink stale). Tokens are
     *    already held by us. Keep preCharge as fee. Return without retrying.
     */
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /*actualUserOpFeePerGas*/
    ) external override {
        require(msg.sender == address(entryPoint), "PM: only EntryPoint");

        (address user, address token, uint256 preCharge) =
            abi.decode(context, (address, address, uint256));

        if (mode == PostOpMode.postOpReverted) {
            // Tokens already held — keep preCharge as fee, do nothing else.
            return;
        }

        // Chainlink call is safe here (postOp is not subject to EIP-7562 rules).
        TokenConfig storage cfg = tokenConfigs[token];
        uint256 actualTokenCost = _ethToTokenRealTime(actualGasCost, cfg.decimals);

        if (preCharge > actualTokenCost) {
            // Refund surplus to the user's smart account.
            IERC20(token).safeTransfer(user, preCharge - actualTokenCost);
        }
        // If actualTokenCost > preCharge (extreme ETH spike in one block),
        // paymaster absorbs the shortfall from accumulated fees.
    }

    // ── Internal price math ────────────────────────────────────────────────────

    /**
     * @dev Live ETH/USD conversion — called only from postOp.
     */
    function _ethToTokenRealTime(
        uint256 ethWei,
        uint8   tokenDecimals
    ) internal view returns (uint256) {
        (
            uint80  roundId,
            int256  ethUsdPrice,
            ,
            uint256 updatedAt,
            uint80  answeredInRound
        ) = ethUsdFeed.latestRoundData();

        require(ethUsdPrice > 0,                              "PM: non-positive price");
        require(answeredInRound >= roundId,                   "PM: stale round");
        require(block.timestamp - updatedAt <= MAX_PRICE_AGE, "PM: stale price");

        // ETH_USD_FEED_DECIMALS used here for consistency, even though
        // external call would also be fine in postOp.
        return _calculateTokenAmount(
            ethWei,
            tokenDecimals,
            uint256(ethUsdPrice),
            ETH_USD_FEED_DECIMALS
        );
    }

    /**
     * @dev Pure ETH-wei → stablecoin-token conversion.
     *
     *      tokenAmount = ethWei × ethUsdPrice × PRICE_MARKUP × 10^tokenDecimals
     *                  ─────────────────────────────────────────────────────────
     *                    10^18  ×  10^feedDecimals  ×  PRICE_DENOMINATOR
     *
     *      Example (ETH=$3000, USDC 6dec, feedDec=8, markup=110):
     *        = 1e15 × 3e11 × 110 × 1e6 / (1e18 × 1e8 × 100)
     *        = 3_300_000  →  3.30 USDC ✓
     */
    function _calculateTokenAmount(
        uint256 ethWei,
        uint8   tokenDecimals,
        uint256 ethUsdPrice,
        uint8   feedDecimals
    ) internal pure returns (uint256) {
        return (
            ethWei
            * ethUsdPrice
            * PRICE_MARKUP
            * (10 ** uint256(tokenDecimals))
        ) / (
            (10 ** 18)
            * (10 ** uint256(feedDecimals))
            * PRICE_DENOMINATOR
        );
    }

    // ── Public quote helper ────────────────────────────────────────────────────

    /**
     * @notice Returns token units needed to cover `ethWei` of gas.
     *         Call from your SDK before building the UserOp to set approval.
     */
    function getTokenAmount(
        address token,
        uint256 ethWei
    ) external view returns (uint256) {
        TokenConfig storage cfg = tokenConfigs[token];
        require(cfg.enabled, "PM: token not enabled");
        return _ethToTokenRealTime(ethWei, cfg.decimals);
    }

    // ── EntryPoint management (owner) ──────────────────────────────────────────

    receive() external payable {}

    function deposit() external payable onlyOwner {
        entryPoint.depositTo{value: msg.value}(address(this));
        emit Deposited(msg.value);
    }

    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }

    function unlockStake() external onlyOwner {
        entryPoint.unlockStake();
    }

    function withdrawStake(address payable to) external onlyOwner {
        entryPoint.withdrawStake(to);
    }

    function withdrawTo(address payable to, uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(to, amount);
    }

    /// @notice Sweep accumulated token fees to a treasury address.
    function withdrawToken(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(to != address(0), "PM: zero to");
        IERC20(token).safeTransfer(to, amount);
        emit TokensWithdrawn(token, to, amount);
    }

    // ── View helpers ───────────────────────────────────────────────────────────

    function supportedTokenCount() external view returns (uint256) {
        return supportedTokens.length;
    }

    function getDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }
}