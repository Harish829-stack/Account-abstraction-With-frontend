import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ObservabilityController } from "./observability.controller";
import { ObservabilityRepository } from "./observability.repository";
import { ObservabilityService } from "./observability.service";

@Module({
  imports: [PrismaModule],
  controllers: [ObservabilityController],
  providers: [ObservabilityRepository, ObservabilityService]
})
export class ObservabilityModule {}
