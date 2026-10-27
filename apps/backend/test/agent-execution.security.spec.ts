import { AbiCoder, Interface } from "ethers";
import { assertAgentExecution } from "../src/agents/agent-signing.service";

const ACCOUNT = "0x0000000000000000000000000000000000000001";
const RECIPIENT = "0x0000000000000000000000000000000000000002";
const TOKEN = "0x0000000000000000000000000000000000000003";
const POOL = "0x0000000000000000000000000000000000000004";
const ROUTER = "0x0000000000000000000000000000000000000005";
const WETH = "0x0000000000000000000000000000000000000006";
const contracts = { usdcToken: TOKEN, aavePool: POOL, uniswapRouter: ROUTER, wethToken: WETH };
const execute = new Interface(["function execute(bytes32,bytes)"]);
const erc20 = new Interface(["function transfer(address,uint256)", "function approve(address,uint256)"]);
const deposit = new Interface(["function deposit(uint256)"]);
const swap = new Interface(["function swapExactETHForTokens(uint256,address[],address,uint256)"]);
function single(target: string, value: bigint, data = "0x") {
  return execute.encodeFunctionData("execute", [`0x${"00".repeat(32)}`,
    `${target}${value.toString(16).padStart(64, "0")}${data.slice(2)}`]);
}

describe("independent signer execution policy", () => {
  it("allows a bounded native transfer and rejects arbitrary calls and account self-calls", () => {
    expect(() => assertAgentExecution(single(RECIPIENT, 1n), ACCOUNT, "native", "0.1", contracts)).not.toThrow();
    expect(() => assertAgentExecution(single(RECIPIENT, 10n ** 18n), ACCOUNT, "native", "0.1", contracts)).toThrow();
    expect(() => assertAgentExecution(single(ACCOUNT, 1n), ACCOUNT, "native", "0.1", contracts)).toThrow();
    expect(() => assertAgentExecution(single(RECIPIENT, 0n, "0x095ea7b3"), ACCOUNT, "native", "0.1", contracts)).toThrow();
  });

  it("limits transfers to the configured token and rejects standalone approvals", () => {
    const transfer = erc20.encodeFunctionData("transfer", [RECIPIENT, 1_000_000n]);
    expect(() => assertAgentExecution(single(TOKEN, 0n, transfer), ACCOUNT, "erc20", "1", contracts)).not.toThrow();
    expect(() => assertAgentExecution(single(RECIPIENT, 0n, transfer), ACCOUNT, "erc20", "1", contracts)).toThrow();
    expect(() => assertAgentExecution(single(TOKEN, 0n, transfer), ACCOUNT, "erc20", "0.5", contracts)).toThrow();
    expect(() => assertAgentExecution(single(TOKEN, 0n, erc20.encodeFunctionData("approve", [RECIPIENT, 1n])),
      ACCOUNT, "erc20", "1", contracts)).toThrow();
  });

  it("permits only the exact approve/deposit batch and rejects mismatched approvals", () => {
    const batch = (approved: bigint, amount: bigint) => execute.encodeFunctionData("execute", [
      `0x01${"00".repeat(31)}`,
      AbiCoder.defaultAbiCoder().encode(["tuple(address,uint256,bytes)[]"], [[
        [TOKEN, 0n, erc20.encodeFunctionData("approve", [POOL, approved])],
        [POOL, 0n, deposit.encodeFunctionData("deposit", [amount])]
      ]])
    ]);
    expect(() => assertAgentExecution(batch(1n, 1n), ACCOUNT, "erc20", "1", contracts)).not.toThrow();
    expect(() => assertAgentExecution(batch(100n, 1n), ACCOUNT, "erc20", "1", contracts)).toThrow();
  });

  it("binds swap output to this account and the configured path", () => {
    const data = (recipient: string) => swap.encodeFunctionData("swapExactETHForTokens", [
      0, [WETH, TOKEN], recipient, Math.floor(Date.now() / 1000) + 60
    ]);
    expect(() => assertAgentExecution(single(ROUTER, 1n, data(ACCOUNT)), ACCOUNT, "uniswap", "1", contracts)).not.toThrow();
    expect(() => assertAgentExecution(single(ROUTER, 1n, data(RECIPIENT)), ACCOUNT, "uniswap", "1", contracts)).toThrow();
    expect(() => assertAgentExecution("0x", ACCOUNT, "uniswap", "1", contracts)).toThrow();
  });
});
