import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { UserOpsRepository } from "../src/user-ops/user-ops.repository";
import { UserOpsService } from "../src/user-ops/user-ops.service";

const ACCOUNT = {
  id: 7,
  ownerEoa: "0x0000000000000000000000000000000000000001",
  chainId: 11155111,
  address: "0x0000000000000000000000000000000000000002",
  salt: "0x",
  deployedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("UserOpsService", () => {
  function setup() {
    const repository = {
      findChain: jest.fn().mockResolvedValue({ chainId: 11155111 }),
      findSmartAccount: jest.fn().mockResolvedValue(null),
      upsertSmartAccount: jest.fn().mockResolvedValue(ACCOUNT),
      upsertUserOperation: jest.fn().mockImplementation((input) =>
        Promise.resolve({
          id: 1,
          hash: input.hash,
          smartAccountId: ACCOUNT.id,
          smartAccount: ACCOUNT,
          chainId: input.chainId,
          label: input.label,
          status: input.status,
          txHash: input.txHash || null,
          confirmedBlock: null,
          confirmedAt: null,
          droppedAt: null,
          calldata: input.calldata,
          receipt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        })
      ),
      updateUserOperationStatus: jest.fn().mockResolvedValue({
        id: 1,
        hash: "0x" + "1".repeat(64),
        smartAccountId: ACCOUNT.id,
        smartAccount: ACCOUNT,
        chainId: 11155111,
        label: "Send UserOperation",
        status: "confirmed",
        txHash: "0x" + "2".repeat(64),
        confirmedBlock: 123,
        confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
        droppedAt: null,
        calldata: "0x",
        receipt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      }),
      listUserOperations: jest.fn()
    };

    return Test.createTestingModule({
      providers: [
        UserOpsService,
        { provide: UserOpsRepository, useValue: repository }
      ]
    })
      .compile()
      .then((moduleRef) => ({
        service: moduleRef.get(UserOpsService),
        repository
      }));
  }

  it("creates a smart account row before storing a new user operation", async () => {
    const { service, repository } = await setup();

    const result = await service.upsertUserOperation({
      hash: "0x" + "1".repeat(64),
      smartAccountAddress: ACCOUNT.address,
      ownerEoa: ACCOUNT.ownerEoa,
      chainId: 11155111,
      label: "Send UserOperation",
      status: "pending",
      calldata: "0x"
    });

    expect(repository.upsertSmartAccount).toHaveBeenCalledWith(ACCOUNT.address, ACCOUNT.ownerEoa, 11155111);
    expect(repository.upsertUserOperation).toHaveBeenCalledWith(
      expect.objectContaining({ hash: "0x" + "1".repeat(64) }),
      ACCOUNT.id
    );
    expect(result).toEqual(expect.objectContaining({
      userOpHash: "0x" + "1".repeat(64),
      status: "pending",
      smartAccountAddress: ACCOUNT.address
    }));
  });

  it("requires ownerEoa when a referenced smart account is unknown", async () => {
    const { service } = await setup();

    await expect(service.upsertUserOperation({
      hash: "0x" + "1".repeat(64),
      smartAccountAddress: ACCOUNT.address,
      chainId: 11155111,
      status: "pending",
      calldata: "0x"
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws when the chain is unknown", async () => {
    const { service, repository } = await setup();
    repository.findChain.mockResolvedValue(null);

    await expect(service.upsertUserOperation({
      hash: "0x" + "1".repeat(64),
      smartAccountAddress: ACCOUNT.address,
      ownerEoa: ACCOUNT.ownerEoa,
      chainId: 1,
      status: "pending",
      calldata: "0x"
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("serializes confirmed status updates", async () => {
    const { service } = await setup();

    await expect(service.updateStatus({
      hash: "0x" + "1".repeat(64),
      status: "confirmed",
      txHash: "0x" + "2".repeat(64),
      confirmedBlock: 123
    })).resolves.toEqual(expect.objectContaining({
      status: "confirmed",
      txHash: "0x" + "2".repeat(64),
      confirmedBlock: 123,
      confirmedAt: "2026-01-01T00:00:00.000Z"
    }));
  });
});
