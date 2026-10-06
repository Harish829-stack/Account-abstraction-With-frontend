import { ActionTag, expandActionTags, isActionTag } from "../src/common/action-tags";

describe("action tag resource mapping", () => {
  it("expands swap to both balances", () => {
    expect(expandActionTags([ActionTag.SWAP])).toEqual([ActionTag.USDC_BALANCE, ActionTag.ETH_BALANCE]);
  });

  it("deduplicates resources across multiple tags", () => {
    expect(expandActionTags([ActionTag.SWAP, ActionTag.ETH_TRANSFER])).toEqual([
      ActionTag.USDC_BALANCE,
      ActionTag.ETH_BALANCE
    ]);
  });

  it("keeps FULL_SYNC as the all-resource fallback", () => {
    expect(expandActionTags([ActionTag.FULL_SYNC])).toEqual(expect.arrayContaining([
      ActionTag.DEPLOYMENT,
      ActionTag.SESSION_KEY,
      ActionTag.APPROVAL,
      ActionTag.AAVE_POSITION,
      ActionTag.USDC_BALANCE,
      ActionTag.ETH_BALANCE,
      ActionTag.MARKET_PRICES
    ]));
  });

  it("rejects unknown client tags", () => {
    expect(isActionTag("SWAP")).toBe(true);
    expect(isActionTag("DROP_DATABASE")).toBe(false);
  });
});
