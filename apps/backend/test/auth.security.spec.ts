import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Wallet } from "ethers";
import { createHmac } from "node:crypto";
import { AuthService } from "../src/auth/auth.service";
import { AuthRepository } from "../src/auth/auth.repository";
import { RedisService } from "../src/redis/redis.service";

describe("wallet authentication security", () => {
  const owner = Wallet.createRandom();
  const other = Wallet.createRandom();
  let service: AuthService;
  let values: Map<string, string>;
  let redis: Record<string, jest.Mock>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AUTH_ORIGIN = "http://localhost:5173";
    process.env.AUTH_JWT_SECRET = "test-only-auth-secret-at-least-32-bytes";
    values = new Map();
    redis = {
      authSet: jest.fn(async (key, value) => { values.set(key, value); }),
      authGet: jest.fn(async (key) => values.get(key) ?? null),
      authConsume: jest.fn(async (key) => {
        const value = values.get(key) ?? null;
        values.delete(key);
        return value;
      }),
      authDelete: jest.fn(async (key) => { values.delete(key); }),
      authRateLimit: jest.fn().mockResolvedValue(undefined)
    };
    service = new AuthService(redis as unknown as RedisService, {
      findChain: jest.fn().mockResolvedValue({ chainId: 421614, isActive: true, viewOnly: false })
    } as unknown as AuthRepository);
  });

  afterEach(() => { process.env = { ...originalEnv }; jest.restoreAllMocks(); });

  async function login() {
    const challenge = await service.challenge(owner.address, 421614, "test-client");
    return service.verify(challenge.challengeId, await owner.signMessage(challenge.message));
  }

  it("issues a domain/chain-bound SIWE message and accepts only the expected signer", async () => {
    const challenge = await service.challenge(owner.address, 421614, "test-client");
    expect(challenge.message).toContain("localhost:5173 wants you to sign in with your Ethereum account:");
    expect(challenge.message).toContain("URI: http://localhost:5173\nVersion: 1\nChain ID: 421614\nNonce:");
    await expect(service.verify(challenge.challengeId, await other.signMessage(challenge.message)))
      .rejects.toBeInstanceOf(UnauthorizedException);
    const result = await service.verify(challenge.challengeId, await owner.signMessage(challenge.message));
    const session = await service.authenticate(`Bearer ${result.accessToken}`);
    expect(session).toMatchObject({ sub: owner.address.toLowerCase(), chainId: 421614 });
  });

  it("consumes a challenge atomically, including concurrent replay attempts", async () => {
    const challenge = await service.challenge(owner.address, 421614, "test-client");
    const signature = await owner.signMessage(challenge.message);
    const results = await Promise.allSettled([
      service.verify(challenge.challengeId, signature), service.verify(challenge.challengeId, signature)
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("rejects expired challenges", async () => {
    const challenge = await service.challenge(owner.address, 421614, "test-client");
    const signature = await owner.signMessage(challenge.message);
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 301_000);
    await expect(service.verify(challenge.challengeId, signature)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects JWT tampering, missing bearer tokens, and revoked sessions", async () => {
    const { accessToken } = await login();
    const parts = accessToken.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    parts[1] = Buffer.from(JSON.stringify({ ...payload, sub: other.address.toLowerCase() })).toString("base64url");
    await expect(service.authenticate(`Bearer ${parts.join(".")}`)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.authenticate(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    const session = await service.authenticate(`Bearer ${accessToken}`);
    await service.logout(session);
    await expect(service.authenticate(`Bearer ${accessToken}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects expired tokens and tokens issued for a different origin", async () => {
    const { accessToken } = await login();
    process.env.AUTH_ORIGIN = "http://localhost:9999";
    await expect(service.authenticate(`Bearer ${accessToken}`)).rejects.toBeInstanceOf(UnauthorizedException);
    process.env.AUTH_ORIGIN = "http://localhost:5173";
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 901_000);
    await expect(service.authenticate(`Bearer ${accessToken}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("fails closed when auth configuration or security storage is unavailable", async () => {
    delete process.env.AUTH_JWT_SECRET;
    await expect(service.challenge(owner.address, 421614, "test-client")).rejects.toBeInstanceOf(ServiceUnavailableException);
    process.env.AUTH_JWT_SECRET = "test-only-auth-secret-at-least-32-bytes";
    redis.authSet.mockRejectedValue(new ServiceUnavailableException());
    await expect(service.challenge(owner.address, 421614, "test-client")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("requires a strong, separate signing-service credential", () => {
    process.env.SIGNING_SERVICE_TOKEN = "test-only-service-token-at-least-32-bytes";
    expect(() => service.requireSigningService(undefined)).toThrow(ForbiddenException);
    expect(() => service.requireSigningService("wrong")).toThrow(ForbiddenException);
    expect(() => service.requireSigningService(process.env.SIGNING_SERVICE_TOKEN)).not.toThrow();
  });

  it("rejects algorithm confusion and invalid issuer/audience even with a valid test MAC", async () => {
    const { accessToken } = await login();
    const [header, payload] = accessToken.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    function signed(inputHeader: string, inputClaims: unknown) {
      const input = `${inputHeader}.${Buffer.from(JSON.stringify(inputClaims)).toString("base64url")}`;
      return `Bearer ${input}.${createHmac("sha256", process.env.AUTH_JWT_SECRET!).update(input).digest("base64url")}`;
    }
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    await expect(service.authenticate(signed(none, claims))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.authenticate(signed(header, { ...claims, aud: "another-service" }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.authenticate(signed(header, { ...claims, iss: "https://attacker.example" }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
