import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { OwnershipService } from "./ownership.service";
import type { AuthRequest } from "./auth.guard";
import { parseAddress, parseChainId, parseOptionalString } from "../common/validation";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly ownership: OwnershipService) {}

  @Post("challenge")
  challenge(@Body() body: Record<string, unknown>, @Req() req: AuthRequest) {
    return this.auth.challenge(parseAddress(body.address, "address"), parseChainId(body.chainId),
      req.ip || req.socket?.remoteAddress || "unknown");
  }

  @Post("verify")
  @HttpCode(200)
  verify(@Body() body: Record<string, unknown>, @Req() req: AuthRequest) {
    return this.auth.verify(parseOptionalString(body.challengeId, "challengeId", 64) || "",
      parseOptionalString(body.signature, "signature", 132) || "", req.ip || req.socket?.remoteAddress || "unknown");
  }

  @Get("session")
  session(@Req() req: AuthRequest) {
    return { address: req.auth.sub, chainId: req.auth.chainId, expiresAt: req.auth.exp * 1000 };
  }

  @Post("authorize")
  @HttpCode(200)
  async authorize(@Body() body: Record<string, unknown>, @Req() req: AuthRequest) {
    if (body.account !== undefined) {
      await this.ownership.requireOwner(req.auth, parseAddress(body.account, "account"), parseChainId(body.chainId));
    }
    return this.session(req);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: AuthRequest) {
    await this.auth.logout(req.auth);
  }
}
