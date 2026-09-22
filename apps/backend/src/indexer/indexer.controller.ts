import { Controller, Post } from "@nestjs/common";
import { IndexerService } from "./indexer.service";
import type { IndexerPollSummary } from "./indexer.types";

@Controller("indexer")
export class IndexerController {
  constructor(private readonly indexerService: IndexerService) {}

  @Post("poll")
  pollOnce(): Promise<IndexerPollSummary> {
    return this.indexerService.pollOnce();
  }
}
