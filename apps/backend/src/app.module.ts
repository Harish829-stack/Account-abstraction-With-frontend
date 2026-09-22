import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { AccountsModule } from "./accounts/accounts.module";
import { AgentsModule } from "./agents/agents.module";
import { AppConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { IndexerModule } from "./indexer/indexer.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReceiptsModule } from "./receipts/receipts.module";
import { RedisModule } from "./redis/redis.module";
import { UserOpsModule } from "./user-ops/user-ops.module";

@Module({
  imports: [
    NestConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AppConfigModule,
    AccountsModule,
    AgentsModule,
    UserOpsModule,
    ReceiptsModule,
    HealthModule,
    IndexerModule,
    ObservabilityModule
  ]
})
export class AppModule {}
