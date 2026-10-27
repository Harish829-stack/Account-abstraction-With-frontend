import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthService, type AuthSession } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { OwnershipService } from "./ownership.service";
import { parseChainId } from "../common/validation";

export interface AuthRequest {
  method: string;
  path: string;
  ip?: string;
  socket?: { remoteAddress?: string };
  headers: Record<string, string | undefined>;
  params: Record<string, string | undefined>;
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
  auth: AuthSession;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly ownership: OwnershipService,
    private readonly repository: AuthRepository
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const path = req.path.replace(/\/+$/, "").toLowerCase();
    if ((req.method === "GET" && ["/config", "/health"].includes(path))
      || (req.method === "POST" && ["/auth/challenge", "/auth/verify"].includes(path))) return true;

    const session = await this.auth.authenticate(req.headers.authorization);
    req.auth = session;
    if (/^\/(admin|observability|indexer|receipts)(\/|$)/.test(path)) {
      await this.auth.requireAdmin(session);
      return true;
    }
    if (path.startsWith("/agents/internal/")) this.auth.requireSigningService(req.headers["x-signing-service-token"]);
    const body = req.body || {};
    for (const key of ["ownerEoa", "userId"]) {
      if (body[key] !== undefined && (typeof body[key] !== "string" || body[key].toLowerCase() !== session.sub)) {
        throw new ForbiddenException("Request identity does not match the signed-in wallet");
      }
    }

    const account = req.params.address || req.params.smartAccount || req.params.smartAccountAddress
      || req.query.smartAccount || body.smartAccountAddress || body.account
      || (path === "/accounts/upsert" ? body.address : undefined);
    if (account !== undefined) {
      if (typeof account !== "string") throw new ForbiddenException("Valid smart account required");
      const chainId = parseChainId(req.query.chainId || body.chainId || session.chainId);
      await this.ownership.requireOwner(session, account, chainId);
    }
    // Looking up a hash must not bypass ownership checks, nor may upsert reassign another account's hash.
    const hash = path.startsWith("/user-ops") ? req.params.hash || body.hash : undefined;
    if (typeof hash === "string") {
      const op = await this.repository.findUserOperation(hash);
      if (op) {
        if (typeof account === "string" && account.toLowerCase() !== op.smartAccount.address.toLowerCase()) {
          throw new ForbiddenException("UserOperation belongs to another smart account");
        }
        await this.ownership.requireOwner(session, op.smartAccount.address, op.chainId);
      }
    }
    return true;
  }
}
