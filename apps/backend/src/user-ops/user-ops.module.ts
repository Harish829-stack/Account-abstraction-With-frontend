import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UserOpsController } from "./user-ops.controller";
import { UserOpsRepository } from "./user-ops.repository";
import { UserOpsService } from "./user-ops.service";

@Module({
  imports: [PrismaModule],
  controllers: [UserOpsController],
  providers: [UserOpsRepository, UserOpsService],
  exports: [UserOpsService]
})
export class UserOpsModule {}
