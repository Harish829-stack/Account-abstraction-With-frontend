import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { Interface } from "ethers";
import { OwnershipService } from "../src/auth/ownership.service";
import { AuthRepository } from "../src/auth/auth.repository";
import type { AuthSession } from "../src/auth/auth.service";
import { jsonRpcCall } from "../src/common/json-rpc";

jest.mock("../src/common/json-rpc", () => ({ jsonRpcCall: jest.fn() }));
const rpc = jest.mocked(jsonRpcCall);
const OWNER = "0x0000000000000000000000000000000000000001";
const ACCOUNT = "0x0000000000000000000000000000000000000002";
const OTHER = "0x0000000000000000000000000000000000000003";
const session = { sub: OWNER, chainId: 421614 } as AuthSession;
const ownerAbi = new Interface(["function getOwner(address) view returns (address)"]);
const factoryAbi = new Interface(["function computeAccountAddress(address,uint256,address[],uint8) view returns (address)"]);

describe("live account ownership", () => {
  let service: OwnershipService;
  beforeEach(() => {
    rpc.mockReset();
    service = new OwnershipService({
      findChain: jest.fn().mockResolvedValue({ isActive: true, viewOnly: false, rpcUrl: "http://test-rpc" }),
      findSharedContract: jest.fn().mockResolvedValue({ address: OTHER })
    } as unknown as AuthRepository);
  });

  it("uses live validator ownership instead of trusting a stored owner", async () => {
    rpc.mockResolvedValueOnce("0x66eee").mockResolvedValueOnce("0x1234")
      .mockResolvedValueOnce(ownerAbi.encodeFunctionResult("getOwner", [OWNER]));
    await expect(service.requireOwner(session, ACCOUNT, 421614)).resolves.toBeUndefined();
    rpc.mockResolvedValueOnce("0x66eee").mockResolvedValueOnce("0x1234")
      .mockResolvedValueOnce(ownerAbi.encodeFunctionResult("getOwner", [OTHER]));
    await expect(service.requireOwner(session, ACCOUNT, 421614)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("binds undeployed ownership to the existing factory's index 1 prediction", async () => {
    rpc.mockResolvedValueOnce("0x66eee").mockResolvedValueOnce("0x")
      .mockResolvedValueOnce(factoryAbi.encodeFunctionResult("computeAccountAddress", [ACCOUNT]));
    await service.requireOwner(session, ACCOUNT, 421614);
    const call = rpc.mock.calls[2][2][0] as { data: string };
    const args = factoryAbi.decodeFunctionData("computeAccountAddress", call.data);
    expect(args[0].toLowerCase()).toBe(OWNER);
    expect(args[1]).toBe(1n);
    expect(args[2]).toHaveLength(0);
    expect(args[3]).toBe(0n);
  });

  it("rejects fake counterfactual accounts, wrong-chain sessions, and misconfigured RPCs", async () => {
    rpc.mockResolvedValueOnce("0x66eee").mockResolvedValueOnce("0x")
      .mockResolvedValueOnce(factoryAbi.encodeFunctionResult("computeAccountAddress", [OTHER]));
    await expect(service.requireOwner(session, ACCOUNT, 421614)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.requireOwner(session, ACCOUNT, 1)).rejects.toBeInstanceOf(ForbiddenException);
    rpc.mockResolvedValueOnce("0x1");
    await expect(service.requireOwner(session, ACCOUNT, 421614)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
