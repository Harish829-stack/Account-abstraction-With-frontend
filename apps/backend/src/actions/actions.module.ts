import { Module } from "@nestjs/common";
import { SyncModule } from "../sync/sync.module";
import { ActionsController } from "./actions.controller";
import { ActionsRepository } from "./actions.repository";
import { ActionsService } from "./actions.service";

@Module({
  imports: [SyncModule],
  controllers: [ActionsController],
  providers: [ActionsRepository, ActionsService]
})
export class ActionsModule {}

