import { Controller, Post } from "@nestjs/common";
import { ReceiptsService } from "./receipts.service";
import type { ReceiptPollSummary } from "./receipts.types";

@Controller("receipts")
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post("poll")
  pollOnce(): Promise<ReceiptPollSummary> {
    return this.receiptsService.pollOnce();
  }
}
