export const ActionTag: Readonly<{
  DEPLOYMENT: "DEPLOYMENT";
  SESSION_KEY: "SESSION_KEY";
  APPROVAL: "APPROVAL";
  AAVE_POSITION: "AAVE_POSITION";
  USDC_BALANCE: "USDC_BALANCE";
  ETH_BALANCE: "ETH_BALANCE";
  MARKET_PRICES: "MARKET_PRICES";
  FULL_SYNC: "FULL_SYNC";
  SWAP: "SWAP";
  AAVE_SUPPLY: "AAVE_SUPPLY";
  AAVE_REPAY: "AAVE_REPAY";
  AAVE_WITHDRAW: "AAVE_WITHDRAW";
  ERC20_TRANSFER: "ERC20_TRANSFER";
  ETH_TRANSFER: "ETH_TRANSFER";
  ACCOUNT_ACTIVATION: "ACCOUNT_ACTIVATION";
  PAYMASTER_APPROVAL: "PAYMASTER_APPROVAL";
}>;

export type ActionTag = (typeof ActionTag)[keyof typeof ActionTag];
export type ResourceTag = "DEPLOYMENT" | "SESSION_KEY" | "APPROVAL" | "AAVE_POSITION" | "USDC_BALANCE" | "ETH_BALANCE" | "MARKET_PRICES";
export const RESOURCE_TAGS: readonly ResourceTag[];
export const ACTION_TAG_RESOURCES: Readonly<Record<ActionTag, readonly ResourceTag[]>>;
export function isActionTag(value: unknown): value is ActionTag;
export function expandActionTags(tags: readonly ActionTag[]): ResourceTag[];

