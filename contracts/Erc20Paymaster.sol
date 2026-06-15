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
 * @notice ERC-4337 Generic Dual-Feed Paymaster accepting any supported ERC-20 token.
 *         Compatible with Skandha public bundler on Sepolia and any EVM chain.
 *
 * ── Validation phase (EIP-7562 compliant) ────────────────────────────────────
 *
 *  Skandha simulates validatePaymasterUserOp under strict opcode/storage rules:
 *    - NO calls to unstaked external contracts (Chainlink is unstaked → banned)
 *    - NO banned opcodes (TIMESTAMP, NUMBER, BLOCKHASH, etc.)
 *    - Storage reads allowed only from: EntryPoint, this paymaster, sender account
 *
 *  Therefore validatePaymasterUserOp:
 *    - Uses only OUR OWN storage (tokenConfigs, maxNativePriceUsd, NATIVE_USD_FEED_DECIMALS)
 *    - Does NOT call Chainlink feeds directly
 *    - Uses `maxNativePriceUsd` and `minTokenPriceUsd` for worst-case pre-charge
 *    - Pre-charges tokens via safeTransferFrom (closes TOCTOU window)
 *
 * ── Execution phase (postOp) ─────────────────────────────────────────────────
 *
 *  postOp runs on-chain after the UserOp executes. External calls are allowed:
 *    - Calls both nativeUsdFeed and tokenUsdFeed latestRoundData()
 *    - Computes exact token cost from actualGasCost across the two price ratios
 *    - Refunds surplus (preCharge - actualCost) to user
 *
 * ── postOpReverted handling ──────────────────────────────────────────────────
 *
 *  If postOp itself reverts, EntryPoint calls postOp again with mode = postOpReverted.
 *  At that point tokens are already held by us from the pre-charge. We return early 
 *  and keep the preCharge as the fee.
 *
 * ── paymasterAndData layout ──────────────────────────────────────────────────
 *
 *  [0  : 20]  paymaster address   (added by SDK)
 *  [20 : 40]  token address       (Any supported ERC20)
 */
contract MultiTokenPaymaster is IPaymaster, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using UserOperationLib for PackedUserOperation;

    // ── Constants ──────────────────────────────────────────────────────────────

    /// @dev 10% markup: buffers price movement between validate and postOp.
    uint256 public constant PRICE_MARKUP      = 110;
    uint256 public constant PRICE_DENOMINATOR = 100;

    /// @dev Chainlink answer rejected if older than this (checked in postOp only).
    uint256 public constant MAX_PRICE_AGE = 1 hours;

    /// @dev Returned in validationData to signal rejection without reverting.
    uint256 private constant SIG_VALIDATION_FAILED = 1;

    /**
     * @dev Decimal precision of the Chainlink Native/USD feed.
     *      Stored as an immutable to avoid external calls during validation.
     */
    uint8 public immutable NATIVE_USD_FEED_DECIMALS;

    // ── Immutables ─────────────────────────────────────────────────────────────

    IEntryPoint public immutable entryPoint;

    // ── Storage ────────────────────────────────────────────────────────────────

    /// @notice Chainlink feed for the native gas token (e.g. ETH/USD, POL/USD).
    AggregatorV3Interface public nativeUsdFeed;

    /**
     * @notice Native token price ceiling used during validation.
     *         Expressed in USD with NATIVE_USD_FEED_DECIMALS implicit decimal places.
     *         Default: $10 000 @ 8 decimals = 10_000 * 1e8 = 1_000_000_000_000
     */
    uint256 public maxNativePriceUsd = 10_000 * 1e8;

    struct TokenConfig {
        bool  enabled;
        uint8 decimals; // Cached from IERC20Metadata
        uint8 feedDecimals; // Cached from Chainlink feed
        AggregatorV3Interface tokenUsdFeed;
        uint256 minTokenPriceUsd; // Worst-case low price for the token during validation
    }

    mapping(address => TokenConfig) public tokenConfigs;
    address[] public supportedTokens;

    // ── Events ─────────────────────────────────────────────────────────────────

    event TokenAdded(address indexed token, uint8 decimals, address feed);
    event TokenEnabled(address indexed token, bool enabled);
    event NativeUsdFeedUpdated(address indexed newFeed);
    event MaxNativePriceUpdated(uint256 newMaxPrice);
    event TokensWithdrawn(address indexed token, address indexed to, uint256 amount);
    event Deposited(uint256 amount);

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(
        address     _initialOwner,
        IEntryPoint _entryPoint,
        address     _nativeUsdFeed
    ) Ownable(_initialOwner) {
        require(address(_entryPoint) != address(0), "PM: zero entryPoint");
        require(_nativeUsdFeed       != address(0), "PM: zero feed");

        entryPoint = _entryPoint;
        nativeUsdFeed = AggregatorV3Interface(_nativeUsdFeed);

        NATIVE_USD_FEED_DECIMALS = AggregatorV3Interface(_nativeUsdFeed).decimals();
    }

    // ── Token management (owner) ───────────────────────────────────────────────

    /**
     * @notice Register an ERC-20 as an accepted payment token.
     * @param token Address of the ERC-20 token
     * @param _tokenUsdFeed Chainlink Price Feed for Token/USD
     * @param _minTokenPriceUsd The absolute lowest price you expect this token to drop to.
     *                          Used to calculate the worst-case pre-charge during validation.
     *                          Must be scaled to _tokenUsdFeed's decimals (usually 8).
     */
    function addToken(
        address token, 
        address _tokenUsdFeed, 
        uint256 _minTokenPriceUsd
    ) external onlyOwner {
        require(token != address(0),          "PM: zero token");
        require(_tokenUsdFeed != address(0),  "PM: zero feed");
        require(_minTokenPriceUsd > 0,        "PM: zero min price");
        require(!tokenConfigs[token].enabled, "PM: already added");

        uint8 dec = IERC20Metadata(token).decimals();
        uint8 feedDec = AggregatorV3Interface(_tokenUsdFeed).decimals();
        
        tokenConfigs[token] = TokenConfig({ 
            enabled: true, 
            decimals: dec,
            feedDecimals: feedDec,
            tokenUsdFeed: AggregatorV3Interface(_tokenUsdFeed),
            minTokenPriceUsd: _minTokenPriceUsd
        });
        supportedTokens.push(token);
        emit TokenAdded(token, dec, _tokenUsdFeed);
    }

    /// @notice Pause or resume a token without removing it.
    function setTokenEnabled(address token, bool enabled) external onlyOwner {
        require(tokenConfigs[token].decimals > 0, "PM: unknown token");
        tokenConfigs[token].enabled = enabled;
        emit TokenEnabled(token, enabled);
    }

    /**
     * @notice Point the paymaster at a new Native/USD feed.
     */
    function setNativeUsdFeed(address feed) external onlyOwner {
        require(feed != address(0), "PM: zero feed");
        require(
            AggregatorV3Interface(feed).decimals() == NATIVE_USD_FEED_DECIMALS,
            "PM: feed decimals mismatch"
        );
        nativeUsdFeed = AggregatorV3Interface(feed);
        emit NativeUsdFeedUpdated(feed);
    }

    function setMaxNativePriceUsd(uint256 _maxPrice) external onlyOwner {
        require(_maxPrice > 0, "PM: zero price");
        maxNativePriceUsd = _maxPrice;
        emit MaxNativePriceUpdated(_maxPrice);
    }
    
    function setMinTokenPriceUsd(address token, uint256 _minPrice) external onlyOwner {
        require(tokenConfigs[token].decimals > 0, "PM: unknown token");
        require(_minPrice > 0, "PM: zero price");
        tokenConfigs[token].minTokenPriceUsd = _minPrice;
    }

    // ── IPaymaster ─────────────────────────────────────────────────────────────

    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == address(entryPoint), "PM: only EntryPoint");

        bytes calldata pmData = userOp.paymasterAndData;
        if (pmData.length < 72) {
            return ("", SIG_VALIDATION_FAILED);
        }
        address chosenToken = address(bytes20(pmData[52:72]));

        TokenConfig storage cfg = tokenConfigs[chosenToken];
        if (!cfg.enabled) {
            return ("", SIG_VALIDATION_FAILED);
        }

        // ── Compute worst-case token cost (no Chainlink call) ──────────
        // Reads from own storage: maxNativePriceUsd, cfg.minTokenPriceUsd, decimals
        uint256 worstCaseTokenCost = _calculateTokenAmount(
            maxCost,
            cfg.decimals,
            maxNativePriceUsd,
            NATIVE_USD_FEED_DECIMALS,
            cfg.minTokenPriceUsd,
            cfg.feedDecimals
        );

        IERC20(chosenToken).safeTransferFrom(
            userOp.sender,
            address(this),
            worstCaseTokenCost
        );

        context = abi.encode(userOp.sender, chosenToken, worstCaseTokenCost);
        return (context, 0); 
    }

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
            return;
        }

        uint256 actualTokenCost = _nativeToTokenRealTime(actualGasCost, token);

        if (preCharge > actualTokenCost) {
            IERC20(token).safeTransfer(user, preCharge - actualTokenCost);
        }
    }

    // ── Internal price math ────────────────────────────────────────────────────

    function _nativeToTokenRealTime(
        uint256 nativeWei,
        address token
    ) internal view returns (uint256) {
        TokenConfig storage cfg = tokenConfigs[token];

        (
            uint80 roundId1,
            int256 nativeUsdPrice,
            ,
            uint256 updatedAt1,
            uint80 answeredInRound1
        ) = nativeUsdFeed.latestRoundData();

        require(nativeUsdPrice > 0, "PM: native price non-positive");
        require(answeredInRound1 >= roundId1, "PM: native round stale");
        require(block.timestamp - updatedAt1 <= MAX_PRICE_AGE, "PM: native price stale");

        (
            uint80 roundId2,
            int256 tokenUsdPrice,
            ,
            uint256 updatedAt2,
            uint80 answeredInRound2
        ) = cfg.tokenUsdFeed.latestRoundData();

        require(tokenUsdPrice > 0, "PM: token price non-positive");
        require(answeredInRound2 >= roundId2, "PM: token round stale");
        require(block.timestamp - updatedAt2 <= MAX_PRICE_AGE, "PM: token price stale");

        return _calculateTokenAmount(
            nativeWei,
            cfg.decimals,
            uint256(nativeUsdPrice),
            NATIVE_USD_FEED_DECIMALS,
            uint256(tokenUsdPrice),
            cfg.feedDecimals
        );
    }

    /**
     * @dev Dual-feed stable math.
     *      tokenAmount = nativeWei * nativeUsdPrice * 10^tokenDecimals * 10^tokenFeedDecimals * MARKUP
     *                  ────────────────────────────────────────────────────────────────────────────────
     *                    10^18 * tokenUsdPrice * 10^nativeFeedDecimals * DENOMINATOR
     */
    function _calculateTokenAmount(
        uint256 nativeWei,
        uint8   tokenDecimals,
        uint256 nativeUsdPrice,
        uint8   nativeFeedDecimals,
        uint256 tokenUsdPrice,
        uint8   tokenFeedDecimals
    ) internal pure returns (uint256) {
        uint256 numerator = nativeWei 
            * nativeUsdPrice 
            * PRICE_MARKUP 
            * (10 ** uint256(tokenDecimals)) 
            * (10 ** uint256(tokenFeedDecimals));

        uint256 denominator = (10 ** 18) 
            * tokenUsdPrice 
            * PRICE_DENOMINATOR 
            * (10 ** uint256(nativeFeedDecimals));

        return numerator / denominator;
    }

    // ── Public quote helper ────────────────────────────────────────────────────

    function getTokenAmount(
        address token,
        uint256 nativeWei
    ) external view returns (uint256) {
        require(tokenConfigs[token].enabled, "PM: token not enabled");
        return _nativeToTokenRealTime(nativeWei, token);
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