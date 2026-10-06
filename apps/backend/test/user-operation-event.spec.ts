import { ethers } from "ethers";
import { parseUserOperationEventSuccess } from "../src/common/user-operation-event";

describe("UserOperationEvent success decoding", () => {
  const encodeEventData = (success: boolean) => ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "bool", "uint256", "uint256"],
    [7n, success, 100n, 200n]
  );

  it("does not treat a successful transaction receipt as a successful reverted UserOperation", () => {
    expect(parseUserOperationEventSuccess(encodeEventData(false), false)).toBe(false);
  });

  it("accepts a successful UserOperation event", () => {
    expect(parseUserOperationEventSuccess(encodeEventData(true), false)).toBe(true);
  });
});
