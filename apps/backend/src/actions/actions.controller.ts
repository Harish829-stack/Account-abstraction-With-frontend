import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { isActionTag, type ActionTag } from "../common/action-tags";
import { parseAddress, parseBytes32, parseChainId } from "../common/validation";
import { ActionsService } from "./actions.service";

@Controller("actions")
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Post("events")
  submit(@Body() body: Record<string, unknown>) {
    if (!Array.isArray(body.tags) || body.tags.length === 0 || !body.tags.every(isActionTag)) {
      throw new BadRequestException("tags must be a non-empty array of known action tags");
    }
    if (body.metadata !== undefined && (typeof body.metadata !== "object" || body.metadata === null || Array.isArray(body.metadata))) {
      throw new BadRequestException("metadata must be an object");
    }

    return this.actionsService.submit({
      account: parseAddress(body.account, "account"),
      chainId: parseChainId(body.chainId),
      tags: body.tags as ActionTag[],
      userOpHash: body.userOpHash ? parseBytes32(body.userOpHash, "userOpHash") : undefined,
      txHash: body.txHash ? parseBytes32(body.txHash, "txHash") : undefined,
      metadata: body.metadata as Record<string, unknown> | undefined
    });
  }
}

