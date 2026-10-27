import { ServiceUnavailableException } from "@nestjs/common";
import { AgentKeysService } from "../src/agents/agent-keys.service";

describe("agent signing key custody", () => {
  const original = process.env.AGENT_KEY_ENCRYPTION_KEY;
  beforeEach(() => { process.env.AGENT_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });
  afterEach(() => {
    if (original === undefined) delete process.env.AGENT_KEY_ENCRYPTION_KEY;
    else process.env.AGENT_KEY_ENCRYPTION_KEY = original;
  });

  it("encrypts generated keys and binds ciphertext to account, chain, and agent", () => {
    const keys = new AgentKeysService();
    const created = keys.generate("account", 421614);
    expect(created.encryptedKey).toMatch(/^v1:/);
    const wallet = keys.unlock(created.encryptedKey, "account", 421614, created.agentAddress);
    expect(created.encryptedKey).not.toContain(wallet.privateKey);
    expect(wallet.address).toBe(created.agentAddress);
    expect(() => keys.unlock(created.encryptedKey, "different-account", 421614, created.agentAddress)).toThrow();
    expect(() => keys.unlock(created.encryptedKey, "account", 1, created.agentAddress)).toThrow();
    expect(() => keys.unlock(created.encryptedKey, "account", 421614, "different-agent")).toThrow();
    const parts = created.encryptedKey.split(":");
    parts[3] = Buffer.alloc(32).toString("base64");
    expect(() => keys.unlock(parts.join(":"), "account", 421614, created.agentAddress)).toThrow();
  });

  it("refuses legacy plaintext and missing encryption configuration", () => {
    const keys = new AgentKeysService();
    expect(() => keys.unlock("legacy-plaintext-placeholder", "account", 421614, "agent")).toThrow();
    delete process.env.AGENT_KEY_ENCRYPTION_KEY;
    expect(() => keys.generate("account", 421614)).toThrow(ServiceUnavailableException);
  });
});
