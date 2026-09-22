import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ReceiptsController } from "./receipts.controller";
import { ReceiptsRepository } from "./receipts.repository";
import { ReceiptsService } from "./receipts.service";

@Module({
  imports: [PrismaModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsRepository, ReceiptsService]
})
export class ReceiptsModule {}
