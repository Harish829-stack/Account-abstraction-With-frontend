import { Module } from "@nestjs/common";
import { AppConfigModule } from "../config/config.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class HealthModule {}
