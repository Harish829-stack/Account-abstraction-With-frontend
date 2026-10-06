import { ethers } from "ethers";
import { ActionTag, type ResourceTag } from "../common/action-tags";

export interface ReceiptLog {
  address: string;
  topics: string[];
  data: string;
}

export interface VerificationContext {
  account: string;
  code: string;
  logs: ReceiptLog[];
  contracts: Record<string, string | undefined>;
  sessionKeyValidator?: string;
}

const topic = (signature: string) => ethers.id(signature).toLowerCase();
const TRANSFER_TOPIC = topic("Transfer(address,address,uint256)");
const APPROVAL_TOPIC = topic("Approval(address,address,uint256)");
const AAVE_TOPICS = new Set([
  topic("Deposited(address,uint256)"),
  topic("Withdrawn(address,uint256)"),
  topic("RewardClaimed(address,uint256)")
]);
const SWAP_TOPIC = topic("SwapETHForUSDC(address,uint256,uint256)");
const SESSION_TOPICS = new Set([
  topic("SessionKeyAdded(address,address,address,bytes4,uint256,uint48,uint48)"),
  topic("SessionKeyRevoked(address,address)")
]);

function addressTopic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function sameAddress(left?: string, right?: string): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function hasAccountTopic(log: ReceiptLog, account: string): boolean {
  const encoded = addressTopic(account);
  return log.topics.slice(1).some((value) => value.toLowerCase() === encoded);
}

type Verifier = (context: VerificationContext) => boolean;

export const RESOURCE_VERIFIERS: Readonly<Record<ResourceTag, Verifier>> = {
  [ActionTag.ETH_BALANCE]: () => true,
  [ActionTag.DEPLOYMENT]: ({ code }) => code !== "0x",
  [ActionTag.USDC_BALANCE]: ({ account, logs, contracts }) => logs.some((log) =>
    sameAddress(log.address, contracts.usdcToken) &&
    log.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
    hasAccountTopic(log, account)
  ),
  [ActionTag.APPROVAL]: ({ account, logs, contracts }) => logs.some((log) =>
    sameAddress(log.address, contracts.usdcToken) &&
    log.topics[0]?.toLowerCase() === APPROVAL_TOPIC &&
    log.topics[1]?.toLowerCase() === addressTopic(account)
  ),
  [ActionTag.AAVE_POSITION]: ({ account, logs, contracts }) => logs.some((log) =>
    sameAddress(log.address, contracts.aavePool) &&
    AAVE_TOPICS.has(log.topics[0]?.toLowerCase()) &&
    hasAccountTopic(log, account)
  ),
  [ActionTag.SESSION_KEY]: ({ account, logs, sessionKeyValidator }) => logs.some((log) =>
    sameAddress(log.address, sessionKeyValidator) &&
    SESSION_TOPICS.has(log.topics[0]?.toLowerCase()) &&
    hasAccountTopic(log, account)
  ),
  [ActionTag.MARKET_PRICES]: () => false
};

export function deriveReceiptEffects(context: VerificationContext): ResourceTag[] {
  const effects = new Set<ResourceTag>([ActionTag.ETH_BALANCE]);

  for (const tag of Object.values(ActionTag)) {
    if (!(tag in RESOURCE_VERIFIERS)) continue;
    const resourceTag = tag as ResourceTag;
    // Account code proves the account is currently deployed, but it does not
    // prove that this particular receipt deployed it. Validate DEPLOYMENT only
    // when the caller requested that resource.
    if (resourceTag === ActionTag.DEPLOYMENT) continue;
    if (RESOURCE_VERIFIERS[resourceTag](context)) effects.add(resourceTag);
  }

  if (context.logs.some((log) =>
    sameAddress(log.address, context.contracts.uniswapRouter) &&
    log.topics[0]?.toLowerCase() === SWAP_TOPIC &&
    hasAccountTopic(log, context.account)
  )) {
    effects.add(ActionTag.USDC_BALANCE);
    effects.add(ActionTag.ETH_BALANCE);
  }

  return [...effects];
}
