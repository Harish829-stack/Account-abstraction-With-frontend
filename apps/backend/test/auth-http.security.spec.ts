import { ForbiddenException, INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AccountsController } from "../src/accounts/accounts.controller";
import { AccountsService } from "../src/accounts/accounts.service";
import { AccountsRepository } from "../src/accounts/accounts.repository";
import { AdminController } from "../src/admin/admin.controller";
import { AdminService } from "../src/admin/admin.service";
import { AgentsController } from "../src/agents/agents.controller";
import { AgentsService } from "../src/agents/agents.service";
import { AgentSigningService } from "../src/agents/agent-signing.service";
import { AuthGuard } from "../src/auth/auth.guard";
import { AuthService } from "../src/auth/auth.service";
import { OwnershipService } from "../src/auth/ownership.service";
import { AuthRepository } from "../src/auth/auth.repository";

const ACCOUNT = "0x0000000000000000000000000000000000000001";
const OTHER = "0x0000000000000000000000000000000000000002";
const AGENT = "0x0000000000000000000000000000000000000003";

describe("HTTP authentication boundaries", () => {
  let app: INestApplication;
  let base: string;
  beforeAll(async () => {
    const auth = {
      authenticate: jest.fn(async (token) => {
        if (!["Bearer owner", "Bearer admin"].includes(token)) throw new UnauthorizedException();
        return { sub: ACCOUNT, chainId: 421614, admin: token === "Bearer admin" };
      }),
      requireAdmin: jest.fn(async (session) => { if (!session.admin) throw new ForbiddenException(); }),
      requireSigningService: jest.fn((token) => { if (token !== "service-credential") throw new ForbiddenException(); })
    };
    const ownership = { requireOwner: jest.fn(async (_session, account, chainId) => {
      if (account.toLowerCase() !== ACCOUNT || chainId !== 421614) throw new ForbiddenException();
    }) };
    const repository = { findUserOperation: jest.fn().mockResolvedValue(null) };
    const module = await Test.createTestingModule({
      controllers: [AccountsController, AdminController, AgentsController],
      providers: [
        { provide: AccountsService, useValue: { getSmartAccount: () => ({ address: ACCOUNT }) } },
        { provide: AccountsRepository, useValue: {} },
        { provide: AdminService, useValue: { getConfig: () => ({ chains: [], sharedContracts: {} }) } },
        { provide: AgentsService, useValue: { getInternalAgent: () => ({ agentAddress: AGENT, status: "active" }) } },
        { provide: AgentSigningService, useValue: {} }
      ]
    }).compile();
    app = module.createNestApplication();
    app.useGlobalGuards(new AuthGuard(auth as unknown as AuthService, ownership as unknown as OwnershipService,
      repository as unknown as AuthRepository));
    await app.listen(0, "127.0.0.1");
    base = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });

  it.each([
    ["GET", `/accounts/${ACCOUNT}?chainId=421614`],
    ["POST", "/accounts/upsert"],
    ["GET", "/admin/config"],
    ["POST", "/admin/chains"],
    ["GET", `/agents/internal/${ACCOUNT}/${AGENT}?chainId=421614`],
    ["POST", `/agents/internal/${ACCOUNT}/${AGENT}/sign`]
  ])("%s %s returns 401 without sign-in", async (method, path) => {
    const res = await fetch(`${base}${path}`, { method });
    expect(res.status).toBe(401);
  });

  it("allows owners and rejects access to another account", async () => {
    const headers = { Authorization: "Bearer owner" };
    expect((await fetch(`${base}/accounts/${ACCOUNT}?chainId=421614`, { headers })).status).toBe(200);
    expect((await fetch(`${base}/accounts/${OTHER}?chainId=421614`, { headers })).status).toBe(403);
  });

  it("requires the admin role and rejects spoofed request identities", async () => {
    expect((await fetch(`${base}/admin/config`, { headers: { Authorization: "Bearer owner" } })).status).toBe(403);
    expect((await fetch(`${base}/admin/config`, { headers: { Authorization: "Bearer admin" } })).status).toBe(200);
    const res = await fetch(`${base}/accounts/upsert`, {
      method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({ address: ACCOUNT, ownerEoa: OTHER, chainId: 421614 })
    });
    expect(res.status).toBe(403);
  });

  it("requires both an owner session and a service credential for internal agent access", async () => {
    const path = `${base}/agents/internal/${ACCOUNT}/${AGENT}?chainId=421614`;
    expect((await fetch(path, { headers: { Authorization: "Bearer owner" } })).status).toBe(403);
    expect((await fetch(path, { headers: { "X-Signing-Service-Token": "service-credential" } })).status).toBe(401);
    const res = await fetch(path, { headers: { Authorization: "Bearer owner", "X-Signing-Service-Token": "service-credential" } });
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("privateKey");
  });

  it("rejects conflicting chain/account selectors instead of authorizing one and using another", async () => {
    const headers = { Authorization: "Bearer owner", "Content-Type": "application/json", "X-Signing-Service-Token": "service-credential" };
    const wrongChain = await fetch(`${base}/agents/internal/${ACCOUNT}/${AGENT}/sign?chainId=421614`, {
      method: "POST", headers, body: JSON.stringify({ chainId: 1, userOp: {} })
    });
    expect(wrongChain.status).toBe(403);
    const wrongAccount = await fetch(`${base}/accounts/upsert`, {
      method: "POST", headers, body: JSON.stringify({ address: OTHER, smartAccountAddress: ACCOUNT, chainId: 421614 })
    });
    expect(wrongAccount.status).toBe(403);
  });
});
