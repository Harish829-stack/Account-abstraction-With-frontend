import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { OwnershipService } from "./ownership.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, OwnershipService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, OwnershipService, AuthRepository]
})
export class AuthModule {}
