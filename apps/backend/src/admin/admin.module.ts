import { Module } from "@nestjs/common";
import { AppConfigModule } from "../config/config.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminController } from "./admin.controller";
import { AdminRepository } from "./admin.repository";
import { AdminService } from "./admin.service";

@Module({
  imports: [AppConfigModule, PrismaModule],
  controllers: [AdminController],
  providers: [AdminRepository, AdminService]
})
export class AdminModule {}
