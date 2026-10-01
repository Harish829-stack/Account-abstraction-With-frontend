-- CreateTable
CREATE TABLE "Chain" (
    "id" SERIAL NOT NULL,
    "chainId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rpcUrl" TEXT NOT NULL,
    "bundlerUrl" TEXT NOT NULL,
    "explorerUrl" TEXT NOT NULL,
    "explorerApiUrl" TEXT,
    "explorerApiChainId" INTEGER,
    "nativeSymbol" TEXT NOT NULL,
    "nativeName" TEXT NOT NULL,
    "nativeDecimals" INTEGER NOT NULL DEFAULT 18,
    "isTestnet" BOOLEAN NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "viewOnly" BOOLEAN NOT NULL DEFAULT false,
    "minPriorityFeeWei" TEXT NOT NULL,
    "minFeeWei" TEXT NOT NULL,
    "lastIndexedBlock" INTEGER,
    "lastSyncError" TEXT,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "Chain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainContract" (
    "id" SERIAL NOT NULL,
    "chainId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "ChainContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedContract" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "SharedContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiweSession" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiweSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartAccount" (
    "id" SERIAL NOT NULL,
    "ownerEoa" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeployed" BOOLEAN NOT NULL DEFAULT false,
    "hasSessionKeyModule" BOOLEAN NOT NULL DEFAULT false,
    "ethBalanceWei" TEXT NOT NULL DEFAULT '0',
    "usdcBalanceWei" TEXT NOT NULL DEFAULT '0',
    "paymasterAllowanceWei" TEXT NOT NULL DEFAULT '0',
    "aaveDepositedWei" TEXT NOT NULL DEFAULT '0',
    "aaveEarningsWei" TEXT NOT NULL DEFAULT '0',
    "ledgerUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "SmartAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" SERIAL NOT NULL,
    "smartAccountId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionKey" (
    "id" SERIAL NOT NULL,
    "smartAccountId" INTEGER NOT NULL,
    "keyAddress" TEXT NOT NULL,
    "name" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'custom',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "privateKey" TEXT,
    "target" TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
    "selector" TEXT NOT NULL DEFAULT '0x00000000',
    "allowedTargets" TEXT[],
    "maxValueWei" TEXT NOT NULL,
    "maxAmount" TEXT,
    "validAfter" INTEGER NOT NULL,
    "validUntil" INTEGER NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "txHashInstall" TEXT,
    "txHashRevoke" TEXT,
    "revokedAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "rawPermissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOperation" (
    "id" SERIAL NOT NULL,
    "hash" TEXT NOT NULL,
    "smartAccountId" INTEGER NOT NULL,
    "chainId" INTEGER NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "txHash" TEXT,
    "confirmedBlock" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "droppedAt" TIMESTAMP(3),
    "calldata" TEXT NOT NULL DEFAULT '0x',
    "receipt" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultisigProposal" (
    "id" SERIAL NOT NULL,
    "chainId" INTEGER NOT NULL,
    "targetContract" TEXT NOT NULL,
    "calldata" TEXT NOT NULL,
    "signatures" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MultisigProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "smartAccountAddress" TEXT NOT NULL,
    "agentAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "calls" JSONB NOT NULL,
    "displayedSummary" JSONB NOT NULL,
    "financialContext" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "userOpHash" TEXT,
    "transactionHash" TEXT,

    CONSTRAINT "TransactionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "smartAccountAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "portfolioJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "proposalId" TEXT,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainMarketData" (
    "id" SERIAL NOT NULL,
    "chainId" INTEGER NOT NULL,
    "ethPriceUsd" TEXT NOT NULL DEFAULT '0',
    "usdcPriceUsd" TEXT NOT NULL DEFAULT '1',
    "aaveApyBps" INTEGER NOT NULL DEFAULT 0,
    "aaveLiquidity" TEXT NOT NULL DEFAULT '0',
    "priceUpdatedAt" TIMESTAMP(3),
    "aaveUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "ChainMarketData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Chain_chainId_key" ON "Chain"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "ChainContract_chainId_key_key" ON "ChainContract"("chainId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SharedContract_key_key" ON "SharedContract"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_address_key" ON "AdminUser"("address");

-- CreateIndex
CREATE UNIQUE INDEX "SmartAccount_chainId_address_key" ON "SmartAccount"("chainId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "SessionKey_smartAccountId_keyAddress_key" ON "SessionKey"("smartAccountId", "keyAddress");

-- CreateIndex
CREATE UNIQUE INDEX "UserOperation_hash_key" ON "UserOperation"("hash");

-- CreateIndex
CREATE INDEX "TransactionProposal_userId_status_idx" ON "TransactionProposal"("userId", "status");

-- CreateIndex
CREATE INDEX "TransactionProposal_smartAccountAddress_chainId_idx" ON "TransactionProposal"("smartAccountAddress", "chainId");

-- CreateIndex
CREATE INDEX "FinancialSnapshot_userId_chainId_idx" ON "FinancialSnapshot"("userId", "chainId");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_userId_eventType_idx" ON "FinancialAuditLog"("userId", "eventType");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_proposalId_idx" ON "FinancialAuditLog"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ChainMarketData_chainId_key" ON "ChainMarketData"("chainId");

-- CreateIndex
CREATE INDEX "ChainMarketData_chainId_idx" ON "ChainMarketData"("chainId");

-- AddForeignKey
ALTER TABLE "ChainContract" ADD CONSTRAINT "ChainContract_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_smartAccountId_fkey" FOREIGN KEY ("smartAccountId") REFERENCES "SmartAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionKey" ADD CONSTRAINT "SessionKey_smartAccountId_fkey" FOREIGN KEY ("smartAccountId") REFERENCES "SmartAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOperation" ADD CONSTRAINT "UserOperation_smartAccountId_fkey" FOREIGN KEY ("smartAccountId") REFERENCES "SmartAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOperation" ADD CONSTRAINT "UserOperation_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain"("chainId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionProposal" ADD CONSTRAINT "TransactionProposal_smartAccountAddress_chainId_fkey" FOREIGN KEY ("smartAccountAddress", "chainId") REFERENCES "SmartAccount"("address", "chainId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSnapshot" ADD CONSTRAINT "FinancialSnapshot_smartAccountAddress_chainId_fkey" FOREIGN KEY ("smartAccountAddress", "chainId") REFERENCES "SmartAccount"("address", "chainId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAuditLog" ADD CONSTRAINT "FinancialAuditLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TransactionProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
