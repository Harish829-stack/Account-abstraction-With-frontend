// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract ERC20Paymaster is IPaymaster, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IEntryPoint public immutable entryPoint;
    IERC20 public immutable token;
    AggregatorV3Interface public immutable priceFeed;
    address public verifyingSigner; // The backend address that signs the UserOp

    uint256 public constant PRICE_MARKUP = 110;
    uint256 public constant PRICE_DENOMINATOR = 100;

    constructor(
        IEntryPoint _entryPoint,
        IERC20 _token,
        address _priceFeed,
        address _verifyingSigner
    ) Ownable(msg.sender) {
        entryPoint = _entryPoint;
        token = _token;
        priceFeed = AggregatorV3Interface(_priceFeed);
        verifyingSigner = _verifyingSigner;
    }

    /**
     * @dev Calculates actual gas used and refunds the excess tokens.
     */
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        require(
            msg.sender == address(entryPoint),
            "Paymaster: only EntryPoint"
        );

        // 1. EXTRACT DATA FROM paymasterAndData
        // Layout: [Address(20)] [ValidUntil(6)] [ValidAfter(6)] [Signature(dynamic)]
        uint48 validUntil = uint48(bytes6(userOp.paymasterAndData[20:26]));
        uint48 validAfter = uint48(bytes6(userOp.paymasterAndData[26:32]));
        bytes calldata signature = userOp.paymasterAndData[32:];

        // 2. VERIFY SIGNATURE
        bytes32 hash = getHash(userOp, validUntil, validAfter);
        if (
            verifyingSigner != hash.toEthSignedMessageHash().recover(signature)
        ) {
            // Sig failed: Return 1 in the least significant bit
            return ("", 1);
        }

        // 3. PRE-CHARGE TOKENS
        uint256 tokenAmount = _getTokenAmount(maxCost);
        token.safeTransferFrom(userOp.sender, address(this), tokenAmount);

        context = abi.encode(userOp.sender, tokenAmount);

        // Return packed time-range and success status
        return (context, _packValidationData(false, validUntil, validAfter));
    }

    function getHash(
        UserOperation calldata userOp,
        uint48 validUntil,
        uint48 validAfter
    ) public view returns (bytes32) {
        // Hash the UserOp fields (excluding paymasterAndData signature part)
        bytes32 userOpHash = keccak256(
            abi.encode(
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.callGasLimit,
                userOp.verificationGasLimit,
                userOp.preVerificationGas,
                userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas
            )
        );

        return
            keccak256(
                abi.encode(
                    userOpHash,
                    block.chainid,
                    address(this),
                    validUntil,
                    validAfter
                )
            );
    }

    function _packValidationData(
        bool sigFailed,
        uint48 validUntil,
        uint48 validAfter
    ) internal pure returns (uint256) {
        return
            (sigFailed ? 1 : 0) |
            (uint256(validUntil) << 160) |
            (uint256(validAfter) << (160 + 48));
    }

    /**
     * @dev Calculates actual gas used and refunds the excess tokens.
     * This completes the IPaymaster interface requirements.
     */
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external override {
        require(
            msg.sender == address(entryPoint),
            "Paymaster: only EntryPoint"
        );

        // If the execution reverted, we don't refund (or handle differently based on project needs)
        if (mode == PostOpMode.postOpReverted) return;

        (address user, uint256 preCharge) = abi.decode(
            context,
            (address, uint256)
        );

        // Calculate the actual token cost based on final gas used
        uint256 actualTokenCost = _getTokenAmount(actualGasCost);

        // If we took more tokens than needed, send the difference back to the user
        if (preCharge > actualTokenCost) {
            token.safeTransfer(user, preCharge - actualTokenCost);
        }
    }

    /**
     * @dev Core math for ETH -> Token conversion using Chainlink.
     */
    function _getTokenAmount(
        uint256 ethAmount
    ) internal view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Paymaster: Invalid price");

        // Logic for 6-decimal tokens (USDC/USDT) and 8-decimal Chainlink feeds
        // Adjust this math if using 18-decimal tokens!
        uint8 tokenDecimals = IERC20Metadata(address(token)).decimals();
        uint8 priceDecimals = priceFeed.decimals();

        uint256 tokenAmount = (ethAmount *
            uint256(price) *
            PRICE_MARKUP *
            10 ** tokenDecimals) /
            (10 ** (18 + priceDecimals) * PRICE_DENOMINATOR);
        return tokenAmount;
    }

    // --- ERC4337 COMPATIBILITY & MANAGEMENT ---

    /**
     * @dev Deposit ETH into EntryPoint to pay for gas.
     */
    function deposit() public payable {
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    /**
     * @dev Adds stake to the EntryPoint to improve Bundler reputation.
     */
    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }

    /**
     * @dev Unlocks the stake (starts the countdown timer).
     */
    function unlockStake() external onlyOwner {
        entryPoint.unlockStake();
    }

    /**
     * @dev Withdraws the stake after the delay has passed.
     */
    function withdrawStake(address payable withdrawAddress) external onlyOwner {
        entryPoint.withdrawStake(withdrawAddress);
    }

    /**
     * @dev Withdraws the deposit from EntryPoint (unused gas tank).
     */
    function withdrawTo(
        address payable withdrawAddress,
        uint256 amount
    ) external onlyOwner {
        entryPoint.withdrawTo(withdrawAddress, amount);
    }

    /**
     * @dev Allows owner to sweep accumulated ERC20 tokens from the paymaster.
     */
    function withdrawToken(address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
