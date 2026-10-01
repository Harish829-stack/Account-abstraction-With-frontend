import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";
import { ChainReaderService } from "../common/chain-reader";
import { MarketController } from "./market.controller";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [AccountsModule],
  controllers: [SyncController, MarketController],
  providers: [SyncService, ChainReaderService],
})
export class SyncModule {}
