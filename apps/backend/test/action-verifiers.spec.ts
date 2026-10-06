import { ethers } from "ethers";
import { ActionTag } from "../src/common/action-tags";
import { deriveReceiptEffects, type ReceiptLog } from "../src/actions/action-verifiers";

const account = "0x1111111111111111111111111111111111111111";
const usdc = "0x2222222222222222222222222222222222222222";
const pool = "0x3333333333333333333333333333333333333333";
const validator = "0x4444444444444444444444444444444444444444";
const addressTopic = (address: string) => `0x${address.slice(2).padStart(64, "0")}`;

const log = (address: string, signature: string, topics: string[] = []): ReceiptLog => ({
  address,
  topics: [ethers.id(signature), ...topics],
  data: "0x"
});

describe("receipt-derived action effects", () => {
  it("derives USDC balance and allowance only from matching logs", () => {
    const effects = deriveReceiptEffects({
      account,
      code: "0x1234",
      logs: [
        log(usdc, "Transfer(address,address,uint256)", [addressTopic(account), addressTopic(pool)]),
        log(usdc, "Approval(address,address,uint256)", [addressTopic(account), addressTopic(pool)])
      ],
      contracts: { usdcToken: usdc },
      sessionKeyValidator: validator
    });

    expect(effects).toEqual(expect.arrayContaining([
      ActionTag.ETH_BALANCE,
      ActionTag.USDC_BALANCE,
      ActionTag.APPROVAL
    ]));
    expect(effects).not.toContain(ActionTag.DEPLOYMENT);
  });

  it("derives Aave and session-key effects from protocol logs", () => {
    const effects = deriveReceiptEffects({
      account,
      code: "0x1234",
      logs: [
        log(pool, "Deposited(address,uint256)", [addressTopic(account)]),
        log(validator, "SessionKeyRevoked(address,address)", [addressTopic(account), addressTopic(usdc)])
      ],
      contracts: { aavePool: pool },
      sessionKeyValidator: validator
    });

    expect(effects).toEqual(expect.arrayContaining([ActionTag.AAVE_POSITION, ActionTag.SESSION_KEY]));
  });
});
