import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { Interface, getBytes, toBeHex, verifyMessage } from "ethers";
import { AgentSigningService } from "../src/agents/agent-signing.service";
import { AgentKeysService } from "../src/agents/agent-keys.service";
import { AgentsRepository } from "../src/agents/agents.repository";
import { AuthRepository } from "../src/auth/auth.repository";
import { jsonRpcCall } from "../src/common/json-rpc";

jest.mock("../src/common/json-rpc", () => ({ jsonRpcCall: jest.fn() }));
const rpc = jest.mocked(jsonRpcCall);
const ACCOUNT = "0x0000000000000000000000000000000000000001";
const RECIPIENT = "0x0000000000000000000000000000000000000002";
const VALIDATOR = "0x0000000000000000000000000000000000000003";
const HASH = `0x${"ab".repeat(32)}`;
const abi = new Interface([
  "function sessionKeys(address,address) view returns (address target,bytes4 selector,uint256 maxValue,uint48 validAfter,uint48 validUntil,bool enabled,uint256 maxUses,uint256 uses)",
  "function getUserOpHash((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes)) view returns (bytes32)",
  "function execute(bytes32,bytes)"
]);

describe("backend-only agent signing", () => {
  const originalKey = process.env.AGENT_KEY_ENCRYPTION_KEY;
  let service: AgentSigningService;
  let agent: any;
  let op: Record<string, unknown>;
  beforeEach(() => {
    process.env.AGENT_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const keys = new AgentKeysService();
    const generated = keys.generate(ACCOUNT, 421614);
    agent = { keyAddress: generated.agentAddress, privateKey: generated.encryptedKey,
      scope: "native", maxAmount: "1", status: "active", revoked: false, validAfter: 0, validUntil: 0 };
    service = new AgentSigningService({
      findSmartAccount: jest.fn().mockResolvedValue({ id: 1 }),
      findAgent: jest.fn(async () => agent)
    } as unknown as AgentsRepository, {
      findChain: jest.fn().mockResolvedValue({ isActive: true, viewOnly: false, rpcUrl: "http://test-rpc", contracts: [] }),
      findSharedContract: jest.fn().mockResolvedValue({ address: VALIDATOR })
    } as unknown as AuthRepository, keys);
    op = {
      sender: ACCOUNT, nonce: toBeHex(BigInt(VALIDATOR) << 64n), initCode: "0x",
      callData: abi.encodeFunctionData("execute", [`0x${"00".repeat(32)}`, `${RECIPIENT}${"1".padStart(64, "0")}`]),
      accountGasLimits: `0x${"00".repeat(32)}`, gasFees: `0x${"00".repeat(32)}`,
      preVerificationGas: "0x0", paymasterAndData: "0x", signature: "0x"
    };
    rpc.mockReset();
    rpc.mockResolvedValueOnce("0x66eee")
      .mockResolvedValueOnce(abi.encodeFunctionResult("sessionKeys", [RECIPIENT, "0x00000000", 1n, 0, 0, true, 0, 0]))
      .mockResolvedValueOnce(abi.encodeFunctionResult("getUserOpHash", [HASH]));
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.AGENT_KEY_ENCRYPTION_KEY;
    else process.env.AGENT_KEY_ENCRYPTION_KEY = originalKey;
  });

  it("returns only a signature over the configured EntryPoint's hash", async () => {
    const response = await service.sign(ACCOUNT, agent.keyAddress, 421614, op);
    expect(Object.keys(response)).toEqual(["signature"]);
    expect(verifyMessage(getBytes(HASH), response.signature)).toBe(agent.keyAddress);
  });

  it("rejects revoked database agents before making chain calls", async () => {
    agent.revoked = true;
    await expect(service.sign(ACCOUNT, agent.keyAddress, 421614, op)).rejects.toBeInstanceOf(ForbiddenException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechecks the active on-chain permission instead of trusting client authorization", async () => {
    rpc.mockReset().mockResolvedValueOnce("0x66eee")
      .mockResolvedValueOnce(abi.encodeFunctionResult("sessionKeys", [RECIPIENT, "0x00000000", 1n, 0, 0, false, 0, 0]));
    await expect(service.sign(ACCOUNT, agent.keyAddress, 421614, op)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses RPC chain mismatches and plaintext legacy keys", async () => {
    agent.privateKey = "legacy-plaintext-placeholder";
    await expect(service.sign(ACCOUNT, agent.keyAddress, 421614, op)).rejects.toBeInstanceOf(ServiceUnavailableException);
    rpc.mockReset().mockResolvedValueOnce("0x1");
    await expect(service.sign(ACCOUNT, agent.keyAddress, 421614, op)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
