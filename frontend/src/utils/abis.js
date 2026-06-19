export const IEntryPointABI = [
  "function depositTo(address account) payable",
  "function balanceOf(address account) view returns (uint256)",
  "function getDepositInfo(address account) view returns (tuple(uint112 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime))",
  "function getNonce(address sender, uint192 key) view returns (uint256)",
  "function getUserOpHash(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) userOp) view returns (bytes32)",
  "function addStake(uint32 unstakeDelaySec) payable",
  "function unlockStake()",
  "function withdrawStake(address payable withdrawAddress)",
  "function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount)",
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
  "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)",
  "error FailedOp(uint256 opIndex, string reason)"
];

export const SmartAccountFactoryABI = [
  "function getAddress(address owner, uint256 salt) view returns (address)",
  "function createAccount(address owner, uint256 salt) returns (address)"
];

export const SmartAccountABI = [
  "function owner() view returns (address)",
  "function execute(bytes32 mode, bytes calldata executionCalldata) external",
  "function execute(address dest, uint256 value, bytes calldata func) external",
  "function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func) external",
  "function addDeposit() payable",
  "function getDeposit() view returns (uint256)",
  "function withdrawDepositTo(address payable withdrawAddress, uint256 amount) external",
  "function changeOwner(address newOwner) external",
  "function installModule(uint256 moduleTypeId, address module, bytes calldata initData) external",
  "function uninstallModule(uint256 moduleTypeId, address module, bytes calldata additionalContext) external",
  "function isModuleInstalled(uint256 moduleTypeId, address module, bytes calldata additionalContext) external view returns (bool)"
];

export const ERC20PaymasterABI = [
  "function deposit() payable",
  "function addStake(uint32 unstakeDelaySec) payable",
  "function unlockStake()",
  "function withdrawStake(address payable withdrawAddress)",
  "function withdrawTo(address payable withdrawAddress, uint256 amount)",
  "function withdrawToken(address token, address to, uint256 amount)",
  "function unlockBlock() view returns (uint256)",
  "function addToken(address token, address _tokenUsdFeed, uint256 _minTokenPriceUsd) external",
  "function setTokenEnabled(address token, bool enabled) external",
  "function setNativeUsdFeed(address feed) external",
  "function setMaxNativePriceUsd(uint256 _maxPrice) external",
  "function setMinTokenPriceUsd(address token, uint256 _minPrice) external",
  "function owner() view returns (address)"
];

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

export const SocialRecoveryValidatorABI = [
  "function approveRecovery(address smartAccount, address newOwner) external",
  "function revokeRecovery(address smartAccount, address newOwner) external",
  "function clearRecovery(address newOwner) external",
  "function canRecover(address smartAccount, address newOwner) view returns (bool)",
  "function hasApproved(address smartAccount, address newOwner, address guardian) view returns (bool)",
  "function recoveryConfigs(address) view returns (uint48 delay, uint16 threshold, uint16 guardianCount)",
  "event SocialRecoveryInstalled(address indexed smartAccount, uint16 threshold, uint48 delay, address[] guardians)",
  "event SocialRecoveryUninstalled(address indexed smartAccount)"
];

export const SessionKeyValidatorABI = [
  "function addSessionKey(tuple(address sessionKey, address target, bytes4 selector, uint256 maxValue, uint48 validAfter, uint48 validUntil) keyData) external",
  "function revokeSessionKey(address sessionKey) external",
  "function sessionKeys(address account, address sessionKey) view returns (address target, bytes4 selector, uint256 maxValue, uint48 validAfter, uint48 validUntil, bool enabled)",
  "event SessionKeyAdded(address indexed smartAccount, address indexed sessionKey, address indexed target, bytes4 selector, uint256 maxValue, uint48 validAfter, uint48 validUntil)",
  "event SessionKeyRevoked(address indexed smartAccount, address indexed sessionKey)"
];
