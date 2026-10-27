import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AbiCoder, Interface, getBytes, parseEther, parseUnits } from "ethers";
import { AuthRepository } from "../auth/auth.repository";
import { jsonRpcCall } from "../common/json-rpc";
import { AgentKeysService } from "./agent-keys.service";
import { AgentsRepository } from "./agents.repository";

const EXECUTE = new Interface(["function execute(bytes32 mode,bytes executionCalldata)"]);
const TOKEN = new Interface(["function transfer(address,uint256)", "function approve(address,uint256)"]);
const DEPOSIT = new Interface(["function deposit(uint256)"]);
const SWAP = new Interface(["function swapExactETHForTokens(uint256,address[],address,uint256)"]);
const ENTRY_POINT = new Interface([
  "function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)) view returns (bytes32)"
]);
const VALIDATOR = new Interface([
  "function sessionKeys(address,address) view returns (address target,bytes4 selector,uint256 maxValue,uint48 validAfter,uint48 validUntil,bool enabled,uint256 maxUses,uint256 uses)"
]);

type Call = { target: string; value: bigint; data: string };

// Independent of the model and chatbot: a signing request must match an enabled tool's exact shape.
export function assertAgentExecution(
  callData: string,
  account: string,
  scope: string,
  maxAmount: string,
  contracts: Record<string, string>
): void {
  try {
    const [mode, execution] = EXECUTE.decodeFunctionData("execute", callData);
    let calls: Call[];
    if (mode === `0x${"00".repeat(32)}`) {
      if (getBytes(execution).length < 52) throw new Error("Invalid execution");
      calls = [{ target: `0x${execution.slice(2, 42)}`, value: BigInt(`0x${execution.slice(42, 106)}`), data: `0x${execution.slice(106)}` }];
    } else if (mode === `0x01${"00".repeat(31)}`) {
      const [decoded] = AbiCoder.defaultAbiCoder().decode(["tuple(address target,uint256 value,bytes callData)[]"], execution);
      calls = Array.from(decoded, (call: { target: string; value: bigint; callData: string }) => ({
        target: call.target, value: call.value, data: call.callData
      }));
    } else throw new Error("Unsupported execution mode");
    const same = (left: string, right?: string) => Boolean(right) && left.toLowerCase() === right?.toLowerCase();
    if (scope === "native" && calls.length === 1) {
      const call = calls[0];
      if (call.data === "0x" && !same(call.target, account) && call.value > 0n && call.value <= parseEther(maxAmount)) return;
    }
    if (scope === "erc20") {
      const limit = parseUnits(maxAmount, 6);
      if (calls.length === 1 && calls[0].value === 0n && same(calls[0].target, contracts.usdcToken)) {
        const [recipient, amount] = TOKEN.decodeFunctionData("transfer", calls[0].data);
        if (!same(recipient, account) && amount > 0n && amount <= limit) return;
      }
      if (calls.length === 2 && calls.every((call) => call.value === 0n)
        && same(calls[0].target, contracts.usdcToken) && same(calls[1].target, contracts.aavePool)) {
        const [spender, approved] = TOKEN.decodeFunctionData("approve", calls[0].data);
        const [deposited] = DEPOSIT.decodeFunctionData("deposit", calls[1].data);
        if (same(spender, contracts.aavePool) && approved === deposited && deposited > 0n && deposited <= limit) return;
      }
    }
    if (scope === "uniswap" && calls.length === 1 && same(calls[0].target, contracts.uniswapRouter)) {
      const [, path, recipient, deadline] = SWAP.decodeFunctionData("swapExactETHForTokens", calls[0].data);
      if (calls[0].value > 0n && calls[0].value <= parseEther(maxAmount) && same(recipient, account)
        && path.length === 2 && same(path[0], contracts.wethToken) && same(path[1], contracts.usdcToken)
        && deadline > BigInt(Math.floor(Date.now() / 1000))) return;
    }
  } catch { /* Malformed calldata is rejected using the same public policy error. */ }
  throw new ForbiddenException("Signing request is outside the agent's permitted actions");
}

@Injectable()
export class AgentSigningService {
  constructor(
    private readonly agents: AgentsRepository,
    private readonly repository: AuthRepository,
    private readonly keys: AgentKeysService
  ) {}

  async sign(accountAddress: string, agentAddress: string, chainId: number, input: Record<string, unknown>) {
    const account = await this.agents.findSmartAccount(accountAddress, chainId);
    const agent = account && await this.agents.findAgent(account.id, agentAddress);
    const now = Math.floor(Date.now() / 1000);
    if (!agent || agent.revoked || agent.status !== "active" || !agent.privateKey
      || agent.validAfter > now || (agent.validUntil !== 0 && agent.validUntil <= now)) {
      throw new ForbiddenException("An active agent is required for signing");
    }
    const chain = await this.repository.findChain(chainId);
    const validator = (await this.repository.findSharedContract("SESSION_KEY_VALIDATOR"))?.address || process.env.SESSION_KEY_VALIDATOR;
    const entryPoint = (await this.repository.findSharedContract("ENTRY_POINT"))?.address || process.env.ENTRY_POINT;
    if (!chain?.rpcUrl || !chain.isActive || chain.viewOnly || !validator || !entryPoint) {
      throw new ServiceUnavailableException("Signing chain is not configured");
    }
    if (typeof input.sender !== "string" || input.sender.toLowerCase() !== accountAddress.toLowerCase() || input.initCode !== "0x") {
      throw new BadRequestException("Signing requires the deployed smart account");
    }
    const fields = ["callData", "accountGasLimits", "gasFees", "paymasterAndData"];
    if (fields.some((field) => typeof input[field] !== "string" || !/^0x[0-9a-fA-F]*$/.test(String(input[field])))) {
      throw new BadRequestException("Invalid packed UserOperation");
    }
    if (["nonce", "preVerificationGas"].some((field) => typeof input[field] !== "string"
      || !/^0x[0-9a-fA-F]{1,64}$/.test(String(input[field])))
      || fields.some((field) => String(input[field]).length % 2 !== 0)) {
      throw new BadRequestException("Invalid UserOperation quantities or bytes");
    }
    if (String(input.accountGasLimits).length !== 66 || String(input.gasFees).length !== 66
      || (BigInt(String(input.nonce) || "0") >> 64n) !== BigInt(validator)) {
      throw new BadRequestException("Invalid agent nonce or gas packing");
    }
    const contracts = Object.fromEntries(chain.contracts.map((contract) => [contract.key, contract.address]));
    assertAgentExecution(String(input.callData), accountAddress, agent.scope, agent.maxAmount || "0", contracts);
    const rpcChain = await jsonRpcCall<string>(chain.rpcUrl, "eth_chainId", []);
    if (!rpcChain || BigInt(rpcChain) !== BigInt(chainId)) throw new ServiceUnavailableException("Signing RPC chain mismatch");
    const onchain = await jsonRpcCall<string>(chain.rpcUrl, "eth_call", [{
      to: validator, data: VALIDATOR.encodeFunctionData("sessionKeys", [agentAddress, accountAddress])
    }, "latest"]);
    const policy = VALIDATOR.decodeFunctionResult("sessionKeys", onchain || "0x");
    if (!policy.enabled || policy.validAfter > BigInt(now) || (policy.validUntil !== 0n && policy.validUntil <= BigInt(now))) {
      throw new ForbiddenException("Agent is not active on-chain");
    }
    const packed = { ...input, signature: "0x" };
    const result = await jsonRpcCall<string>(chain.rpcUrl, "eth_call", [{
      to: entryPoint, data: ENTRY_POINT.encodeFunctionData("getUserOpHash", [packed])
    }, "latest"]);
    const [hash] = ENTRY_POINT.decodeFunctionResult("getUserOpHash", result || "0x");
    const wallet = this.keys.unlock(agent.privateKey, accountAddress, chainId, agentAddress);
    return { signature: await wallet.signMessage(getBytes(hash)) };
  }
}
