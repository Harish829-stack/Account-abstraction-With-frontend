import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { AccountsModule } from "./accounts/accounts.module";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { UserOpsModule } from "./user-ops/user-ops.module";

@Module({
  imports: [
    NestConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AppConfigModule,
    AccountsModule,
    UserOpsModule
  ]
})
export class AppModule {}
