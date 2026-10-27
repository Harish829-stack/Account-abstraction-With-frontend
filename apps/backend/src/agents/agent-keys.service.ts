import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Wallet } from "ethers";

@Injectable()
export class AgentKeysService {
  private encryptionKey(): Buffer {
    const configured = process.env.AGENT_KEY_ENCRYPTION_KEY || "";
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32 || key.toString("base64") !== configured) {
      throw new ServiceUnavailableException("Agent key encryption is not configured");
    }
    return key;
  }

  private context(account: string, chainId: number, agent: string): Buffer {
    return Buffer.from(`${chainId}:${account.toLowerCase()}:${agent.toLowerCase()}`);
  }

  generate(account: string, chainId: number): { agentAddress: string; encryptedKey: string } {
    const key = this.encryptionKey();
    const wallet = Wallet.createRandom();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(this.context(account, chainId, wallet.address));
    const ciphertext = Buffer.concat([cipher.update(wallet.privateKey, "utf8"), cipher.final()]);
    return {
      agentAddress: wallet.address,
      encryptedKey: ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":")
    };
  }

  unlock(encrypted: string, account: string, chainId: number, agent: string): Wallet {
    const key = this.encryptionKey();
    try {
      const [version, iv, tag, ciphertext, extra] = encrypted.split(":");
      if (version !== "v1" || !iv || !tag || !ciphertext || extra !== undefined) throw new Error("Unsupported key format");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      decipher.setAAD(this.context(account, chainId, agent));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]);
      try {
        const wallet = new Wallet(plaintext.toString("utf8"));
        if (wallet.address.toLowerCase() !== agent.toLowerCase()) throw new Error("Key mismatch");
        return wallet;
      } finally { plaintext.fill(0); }
    } catch {
      throw new ServiceUnavailableException("Agent key is unavailable; revoke and recreate legacy agents");
    }
  }
}
