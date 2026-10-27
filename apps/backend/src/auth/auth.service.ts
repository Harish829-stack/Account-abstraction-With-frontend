import {
  BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException
} from "@nestjs/common";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import { RedisService } from "../redis/redis.service";
import { AuthRepository } from "./auth.repository";

const CHALLENGE_SECONDS = 300;
const SESSION_SECONDS = 900;
const AUDIENCE = "aa-smart-wallet-api";
const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

export interface AuthSession {
  sub: string;
  chainId: number;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

interface Challenge {
  address: string;
  chainId: number;
  message: string;
  origin: string;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  constructor(private readonly redis: RedisService, private readonly repository: AuthRepository) {}

  private settings() {
    const secret = process.env.AUTH_JWT_SECRET || "";
    let origin: URL;
    try { origin = new URL(process.env.AUTH_ORIGIN || ""); }
    catch { throw new ServiceUnavailableException("Authentication is not configured"); }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (Buffer.byteLength(secret) < 32 || origin.username || origin.password || origin.search || origin.hash
      || origin.pathname !== "/" || (origin.protocol !== "https:" && !(local && origin.protocol === "http:"))) {
      throw new ServiceUnavailableException("Authentication is not configured securely");
    }
    return { secret, origin: origin.origin, domain: origin.host };
  }

  async challenge(address: string, chainId: number, client: string) {
    const settings = this.settings();
    let checksumAddress: string;
    try { checksumAddress = getAddress(address); }
    catch { throw new BadRequestException("address must be a valid Ethereum address"); }
    const chain = await this.repository.findChain(chainId);
    if (!chain?.isActive || chain.viewOnly || chainId !== 421614) {
      throw new BadRequestException("Authentication requires an active supported chain");
    }
    const clientHash = createHash("sha256").update(client).digest("hex");
    await this.redis.authRateLimit(`auth:challenge-rate:${clientHash}`, 10, 60);
    const challengeId = randomBytes(32).toString("hex");
    const nonce = randomBytes(16).toString("hex");
    const issuedAt = Date.now();
    const expiresAt = issuedAt + CHALLENGE_SECONDS * 1000;
    const message = `${settings.domain} wants you to sign in with your Ethereum account:\n${checksumAddress}\n\n`
      + "Sign in to AA Smart Wallet. This does not authorize transactions.\n\n"
      + `URI: ${settings.origin}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\n`
      + `Issued At: ${new Date(issuedAt).toISOString()}\nExpiration Time: ${new Date(expiresAt).toISOString()}`;
    const challenge: Challenge = { address: checksumAddress.toLowerCase(), chainId, message, expiresAt, origin: settings.origin };
    await this.redis.authSet(`auth:challenge:${challengeId}`, JSON.stringify(challenge), CHALLENGE_SECONDS);
    return { challengeId, message, expiresAt: new Date(expiresAt).toISOString() };
  }

  async verify(challengeId: string, signature: string, client = "unknown") {
    const settings = this.settings();
    const clientHash = createHash("sha256").update(client).digest("hex");
    await this.redis.authRateLimit(`auth:verify-rate:${clientHash}`, 30, 60);
    if (!/^[a-f0-9]{64}$/.test(challengeId) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      throw new UnauthorizedException("Invalid sign-in proof");
    }
    const key = `auth:challenge:${challengeId}`;
    const stored = await this.redis.authGet(key);
    if (!stored) throw new UnauthorizedException("Sign-in challenge expired or already used");
    const challenge = JSON.parse(stored) as Challenge;
    if (challenge.expiresAt <= Date.now() || challenge.origin !== settings.origin) {
      throw new UnauthorizedException("Sign-in challenge expired or has a different origin");
    }
    let recovered: string;
    try { recovered = verifyMessage(challenge.message, signature).toLowerCase(); }
    catch { throw new UnauthorizedException("Invalid sign-in proof"); }
    if (recovered !== challenge.address) throw new UnauthorizedException("Invalid sign-in proof");
    // Verify before consumption to prevent invalid signatures burning another user's challenge.
    if (await this.redis.authConsume(key) !== stored) throw new UnauthorizedException("Sign-in challenge already used");
    const now = Math.floor(Date.now() / 1000);
    const session: AuthSession = {
      sub: recovered, chainId: challenge.chainId, jti: randomBytes(32).toString("hex"),
      iat: now, exp: now + SESSION_SECONDS, iss: settings.origin, aud: AUDIENCE
    };
    await this.redis.authSet(`auth:session:${session.jti}`, `${session.sub}:${session.chainId}`, SESSION_SECONDS);
    const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
    const signingInput = `${HEADER}.${payload}`;
    const mac = createHmac("sha256", settings.secret).update(signingInput).digest("base64url");
    return { accessToken: `${signingInput}.${mac}`, expiresAt: session.exp * 1000, address: session.sub, chainId: session.chainId };
  }

  async authenticate(authorization: string | undefined): Promise<AuthSession> {
    if (!authorization || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization) || authorization.length > 4096) {
      throw new UnauthorizedException("Wallet sign-in required");
    }
    const settings = this.settings();
    const parts = authorization.slice(7).split(".");
    if (parts.length !== 3 || parts[0] !== HEADER || !/^[A-Za-z0-9_-]+$/.test(parts[1])) {
      throw new UnauthorizedException("Invalid access token");
    }
    const expected = createHmac("sha256", settings.secret).update(`${parts[0]}.${parts[1]}`).digest();
    const received = Buffer.from(parts[2], "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new UnauthorizedException("Invalid access token");
    }
    let session: AuthSession;
    try { session = JSON.parse(Buffer.from(parts[1], "base64url").toString()); }
    catch { throw new UnauthorizedException("Invalid access token"); }
    const now = Math.floor(Date.now() / 1000);
    if (!session || !/^0x[a-f0-9]{40}$/.test(session.sub) || !/^[a-f0-9]{64}$/.test(session.jti)
      || !Number.isSafeInteger(session.chainId) || session.chainId <= 0
      || !Number.isSafeInteger(session.exp) || !Number.isSafeInteger(session.iat)
      || session.exp <= now || session.iat > now || session.exp - session.iat !== SESSION_SECONDS
      || session.iss !== settings.origin || session.aud !== AUDIENCE) {
      throw new UnauthorizedException("Expired or invalid access token");
    }
    if (await this.redis.authGet(`auth:session:${session.jti}`) !== `${session.sub}:${session.chainId}`) {
      throw new UnauthorizedException("Session expired or revoked");
    }
    return session;
  }

  async logout(session: AuthSession) {
    await this.redis.authDelete(`auth:session:${session.jti}`);
  }

  async requireAdmin(session: AuthSession) {
    if (!await this.repository.findAdmin(session.sub)) throw new ForbiddenException("Administrator access required");
  }

  requireSigningService(credential: string | undefined) {
    const expected = process.env.SIGNING_SERVICE_TOKEN || "";
    if (Buffer.byteLength(expected) < 32 || expected === process.env.AUTH_JWT_SECRET) {
      throw new ServiceUnavailableException("Signing service is not configured securely");
    }
    const supplied = Buffer.from(credential || "");
    const secret = Buffer.from(expected);
    if (secret.length !== supplied.length || !timingSafeEqual(secret, supplied)) {
      throw new ForbiddenException("Signing service access required");
    }
  }
}
