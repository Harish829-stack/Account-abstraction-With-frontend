export const IEntryPointABI = [
  "function depositTo(address account) payable",
  "function balanceOf(address account) view returns (uint256)",
  "function getDepositInfo(address account) view returns (tuple(uint112 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime))",
  "function getNonce(address sender, uint192 key) view returns (uint256)",
  "function getUserOpHash(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) view returns (bytes32)",
  "function addStake(uint32 unstakeDelaySec) payable",
  "function unlockStake()",
  "function withdrawStake(address payable withdrawAddress)",
  "function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount)",
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)"
];

export const SmartAccountFactoryABI = [
  "function getAddress(address owner, uint256 salt) view returns (address)",
  "function createAccount(address owner, uint256 salt) returns (address)"
];

export const SmartAccountABI = [
  "function owner() view returns (address)",
  "function execute(address dest, uint256 value, bytes calldata func) external",
  "function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func) external",
  "function addDeposit() payable",
  "function getDeposit() view returns (uint256)",
  "function withdrawDepositTo(address payable withdrawAddress, uint256 amount) external",
  "function changeOwner(address newOwner) external"
];

export const ERC20PaymasterABI = [
  "function deposit() payable",
  "function addStake(uint32 unstakeDelaySec) payable",
  "function unlockStake()",
  "function withdrawStake(address payable withdrawAddress)",
  "function withdrawTo(address payable withdrawAddress, uint256 amount)",
  "function withdrawToken(address to, uint256 amount)",
  "function unlockBlock() view returns (uint256)"
];

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];
