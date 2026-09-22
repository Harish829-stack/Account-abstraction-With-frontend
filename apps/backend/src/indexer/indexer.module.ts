import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { IndexerController } from "./indexer.controller";
import { IndexerRepository } from "./indexer.repository";
import { IndexerService } from "./indexer.service";

@Module({
  imports: [PrismaModule],
  controllers: [IndexerController],
  providers: [IndexerRepository, IndexerService]
})
export class IndexerModule {}
