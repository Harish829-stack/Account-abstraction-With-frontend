import { AgentsService } from "../src/agents/agents.service";
import { AgentsRepository } from "../src/agents/agents.repository";
import { AgentKeysService } from "../src/agents/agent-keys.service";

describe("agent public serialization baseline", () => {
  it("keeps private material out of public responses and derives expired status", async () => {
    const repository = {
      findSmartAccount: jest.fn().mockResolvedValue({ id: 1 }),
      listAgents: jest.fn().mockResolvedValue([{
        keyAddress: "0x0000000000000000000000000000000000000001",
        privateKey: "sensitive-test-placeholder",
        scope: "native", status: "active", revoked: false,
        validAfter: 0, validUntil: 1, maxValueWei: "1",
        target: "0x0000000000000000000000000000000000000000", selector: "0x00000000",
        createdAt: new Date(0), updatedAt: new Date(0)
      }])
    };
    const service = new AgentsService(repository as unknown as AgentsRepository, new AgentKeysService());
    const response = await service.listAgents("0x0000000000000000000000000000000000000002", 421614);
    expect(response[0]).toMatchObject({ status: "expired", authorized: false });
    expect(JSON.stringify(response)).not.toContain("sensitive-test-placeholder");
  });
});
