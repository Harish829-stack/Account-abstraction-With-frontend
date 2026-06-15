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
 * @title MultiTokenPaymaster
 * @notice ERC-4337 Paymaster that accepts USDT, USDC, DAI, and USDS as gas payment.
 *         Compatible with Skandha public bundler on Sepolia.
 *
 * Price logic (Decentralized Pre-Authorization Pattern):
 *   To remain fully decentralized while passing strict ERC-4337 simulation rules:
 *   1. `validatePaymasterUserOp` does NOT call Chainlink (banned external call).
 *      Instead, it uses a hardcoded `maxEthPriceUsd` (e.g., $10,000) to calculate
 *      the worst-case token cost and checks if the user has enough balance/allowance.
 *   2. `postOp` is called after execution. It calls Chainlink to get the REAL
 *      ETH price, calculates the exact token cost, and transfers the exact amount.
 *
 * paymasterAndData layout:
 *   [paymaster address (20 bytes)]
 *   [token address (20 bytes)]
 *
 * Skandha compatibility:
 *   - Read-only validation without external calls to unstaked contracts.
 *   - postOp handles real-time token charging and postOpReverted anti-griefing.
 *   - Paymaster must be staked + deposited in EntryPoint before use.
 */
contract MultiTokenPaymaster is IPaymaster, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using UserOperationLib for PackedUserOperation;

    // ── Constants ──────────────────────────────────────────────────────────────

    /// @dev 10% markup over actual cost to cover volatility and bundler tip.
    uint256 public constant PRICE_MARKUP      = 110;
    uint256 public constant PRICE_DENOMINATOR = 100;

    /// @dev Chainlink answer must not be older than this.
    uint256 public constant MAX_PRICE_AGE = 1 hours;

    /// @dev validationData value that signals "paymaster rejected this op".
    uint256 private constant SIG_VALIDATION_FAILED = 1;

    // ── Storage ────────────────────────────────────────────────────────────────

    IEntryPoint public immutable entryPoint;

    /// @notice Single ETH/USD Chainlink feed used for all token conversions.
    AggregatorV3Interface public ethUsdFeed;

    /// @notice Worst-case ETH price (in USD, with feedDecimals) used for validation.
    /// Default: 10,000 USD. If ETH price spikes above this, postOp might revert if user
    /// lacks funds, so admin should increase this if ETH approaches $10k.
    /// Assuming feed is 8 decimals: $10,000 = 10000 * 10^8 = 1000000000000
    uint256 public maxEthPriceUsd = 10000 * 10**8;

    struct TokenConfig {
        bool  enabled;
        uint8 decimals; // cached; avoids external call in hot path
    }

    /// @notice token address → config.
    mapping(address => TokenConfig) public tokenConfigs;

    /// @notice Ordered list of ever-added tokens (for enumeration).
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
        address  _ethUsdFeed
    ) Ownable(msg.sender){
        require(address(_entryPoint) != address(0), "PM: zero entryPoint");
        require(_ethUsdFeed          != address(0), "PM: zero feed");
        entryPoint = _entryPoint;
        ethUsdFeed = AggregatorV3Interface(_ethUsdFeed);
    }

    // ── Management ─────────────────────────────────────────────────────────────

    function addToken(address token) external onlyOwner {
        require(token != address(0),               "PM: zero token");
        require(!tokenConfigs[token].enabled,      "PM: already added");

        uint8 dec = IERC20Metadata(token).decimals();
        tokenConfigs[token] = TokenConfig({ enabled: true, decimals: dec });
        supportedTokens.push(token);
        emit TokenAdded(token, dec);
    }

    function setTokenEnabled(address token, bool enabled) external onlyOwner {
        require(tokenConfigs[token].decimals > 0, "PM: unknown token");
        tokenConfigs[token].enabled = enabled;
        emit TokenEnabled(token, enabled);
    }

    function setEthUsdFeed(address feed) external onlyOwner {
        require(feed != address(0), "PM: zero feed");
        ethUsdFeed = AggregatorV3Interface(feed);
        emit EthUsdFeedUpdated(feed);
    }

    function setMaxEthPriceUsd(uint256 _maxPrice) external onlyOwner {
        require(_maxPrice > 0, "PM: zero price");
        maxEthPriceUsd = _maxPrice;
        emit MaxEthPriceUpdated(_maxPrice);
    }

    // ── IPaymaster ─────────────────────────────────────────────────────────────

    /**
     * @notice EntryPoint calls this during UserOp verification.
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == address(entryPoint), "PM: only EntryPoint");

        bytes calldata pmData = userOp.paymasterAndData;
        
        // Expected layout:
        // [0:20] paymaster address
        // [20:40] token address
        if (pmData.length < 40) {
            return ("", SIG_VALIDATION_FAILED);
        }
        
        address chosenToken = address(bytes20(pmData[20:40]));

        TokenConfig storage cfg = tokenConfigs[chosenToken];
        if (!cfg.enabled) {
            return ("", SIG_VALIDATION_FAILED);
        }

        // ── Pre-Authorization (Worst-Case Cost) ────────────────────────────
        // Calculate the worst-case cost using the hardcoded maxEthPriceUsd.
        // This avoids calling Chainlink during validation (which is banned).
        uint8 feedDecimals = 8; // standard for USD pairs
        uint256 worstCaseTokenCost = _calculateTokenAmount(maxCost, cfg.decimals, maxEthPriceUsd, feedDecimals);

        if (IERC20(chosenToken).balanceOf(userOp.sender) < worstCaseTokenCost || 
            IERC20(chosenToken).allowance(userOp.sender, address(this)) < worstCaseTokenCost) {
            return ("", SIG_VALIDATION_FAILED);
        }

        context = abi.encode(userOp.sender, chosenToken);
        return (context, 0); // valid forever (no validUntil bounds)
    }

    /**
     * @notice EntryPoint calls this after the UserOp executes.
     *         Calculates exact cost via Chainlink and charges the user.
     */
    function postOp(
        PostOpMode /*mode*/,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /*actualUserOpFeePerGas*/
    ) external override {
        require(msg.sender == address(entryPoint), "PM: only EntryPoint");

        (address user, address token) = abi.decode(context, (address, address));

        TokenConfig storage cfg = tokenConfigs[token];
        
        // Fetch REAL price from Chainlink (Allowed in postOp)
        uint256 actualTokenCost = _ethToTokenRealTime(actualGasCost, cfg.decimals);

        if (actualTokenCost > 0) {
            // This safely catches griefing: if a user revokes allowance in execution, 
            // the first call here will revert, EntryPoint reverts execution (restoring allowance), 
            // and calls this again with mode=postOpReverted, where it will succeed.
            IERC20(token).safeTransferFrom(user, address(this), actualTokenCost);
        }
    }

    // ── Price math ─────────────────────────────────────────────────────────────

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

        require(ethUsdPrice > 0,               "PM: non-positive price");
        require(answeredInRound >= roundId,     "PM: stale round");
        require(
            block.timestamp - updatedAt <= MAX_PRICE_AGE,
            "PM: stale price"
        );

        uint8 feedDecimals = ethUsdFeed.decimals();
        
        return _calculateTokenAmount(ethWei, tokenDecimals, uint256(ethUsdPrice), feedDecimals);
    }

    function _calculateTokenAmount(
        uint256 ethWei,
        uint8 tokenDecimals,
        uint256 ethUsdPrice,
        uint8 feedDecimals
    ) internal pure returns (uint256) {
        return (
            ethWei
            * ethUsdPrice
            * PRICE_MARKUP
            * (10 ** tokenDecimals)
        ) / (
            (10 ** 18)
            * (10 ** feedDecimals)
            * PRICE_DENOMINATOR
        );
    }

    // ── Public quote helper ────────────────────────────────────────────────────

    function getTokenAmount(
        address token,
        uint256 ethWei
    ) external view returns (uint256) {
        TokenConfig storage cfg = tokenConfigs[token];
        require(cfg.enabled, "PM: token not enabled");
        return _ethToTokenRealTime(ethWei, cfg.decimals);
    }

    // ── EntryPoint management ─────────────────────────────────────────────────

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

    function withdrawToken(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(to != address(0), "PM: zero to");
        IERC20(token).safeTransfer(to, amount);
        emit TokensWithdrawn(token, to, amount);
    }

    function supportedTokenCount() external view returns (uint256) {
        return supportedTokens.length;
    }

    function getDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }
}