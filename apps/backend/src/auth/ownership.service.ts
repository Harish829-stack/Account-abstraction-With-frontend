import { ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Interface } from "ethers";
import { jsonRpcCall } from "../common/json-rpc";
import { AuthRepository } from "./auth.repository";
import type { AuthSession } from "./auth.service";

const VALIDATOR = new Interface(["function getOwner(address) view returns (address)"]);
const FACTORY = new Interface(["function computeAccountAddress(address,uint256,address[],uint8) view returns (address)"]);

@Injectable()
export class OwnershipService {
  constructor(private readonly repository: AuthRepository) {}

  async requireOwner(session: AuthSession, account: string, chainId: number): Promise<void> {
    if (session.chainId !== chainId) throw new ForbiddenException("Sign in on the requested chain");
    if (!/^0x[0-9a-fA-F]{40}$/.test(account)) throw new ForbiddenException("Valid smart account required");
    const chain = await this.repository.findChain(chainId);
    if (!chain?.isActive || chain.viewOnly || !chain.rpcUrl) throw new ForbiddenException("Chain is not active");
    // Do not trust ownerEoa supplied by the browser or historical database ownership.
    let owner: string;
    try {
      const actualChain = await jsonRpcCall<string>(chain.rpcUrl, "eth_chainId", []);
      if (!actualChain || BigInt(actualChain) !== BigInt(chainId)) throw new Error("RPC chain mismatch");
      const code = await jsonRpcCall<string>(chain.rpcUrl, "eth_getCode", [account, "latest"]);
      if (code === null) throw new Error("Account bytecode unavailable");
      if (code !== "0x") {
        const validator = await this.repository.findSharedContract("K1_VALIDATOR");
        const address = validator?.address || process.env.K1_VALIDATOR;
        if (!address) throw new Error("Owner validator not configured");
        const result = await jsonRpcCall<string>(chain.rpcUrl, "eth_call", [{
          to: address, data: VALIDATOR.encodeFunctionData("getOwner", [account])
        }, "latest"]);
        owner = String(VALIDATOR.decodeFunctionResult("getOwner", result || "0x")[0]);
      } else {
        const factory = await this.repository.findSharedContract("FACTORY");
        const address = factory?.address || process.env.FACTORY;
        if (!address) throw new Error("Account factory not configured");
        const result = await jsonRpcCall<string>(chain.rpcUrl, "eth_call", [{
          to: address, data: FACTORY.encodeFunctionData("computeAccountAddress", [session.sub, 1, [], 0])
        }, "latest"]);
        const predicted = String(FACTORY.decodeFunctionResult("computeAccountAddress", result || "0x")[0]);
        owner = predicted.toLowerCase() === account.toLowerCase() ? session.sub : "";
      }
    } catch {
      throw new ServiceUnavailableException("Account ownership could not be verified");
    }
    if (owner.toLowerCase() !== session.sub) throw new ForbiddenException("Smart account owner access required");
  }
}
