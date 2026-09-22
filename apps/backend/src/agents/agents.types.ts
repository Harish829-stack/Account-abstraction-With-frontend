export type AgentStatus = "pending" | "active" | "revoked" | "expired";

export interface CreateAgentInput {
  smartAccountAddress: string;
  ownerEoa?: string;
  chainId: number;
  agentAddress: string;
  privateKey?: string;
  name?: string;
  scope: string;
  maxAmount?: string;
  maxValueWei?: string;
  target?: string;
  selector?: string;
  validAfter?: number;
  validUntil?: number;
  txHashInstall?: string;
}

export interface AuthorizeAgentInput {
  smartAccountAddress: string;
  chainId: number;
  agentAddress: string;
  target?: string;
  selector?: string;
  maxValueWei?: string;
  validAfter?: number;
  validUntil?: number;
  txHashInstall?: string;
}

export interface RevokeAgentInput {
  smartAccountAddress: string;
  chainId: number;
  agentAddress: string;
  txHashRevoke?: string;
}

export interface SyncAgentsInput {
  smartAccountAddress: string;
  chainId: number;
  moduleInstalled: boolean;
  activeAgentAddresses: string[];
}

export interface AgentResponse {
  agentAddress: string;
  name?: string;
  scope: string;
  maxAmount?: string;
  maxValueWei: string;
  target: string;
  selector: string;
  validAfter: number;
  validUntil: number;
  authorized: boolean;
  status: AgentStatus;
  revoked: boolean;
  txHashInstall?: string;
  txHashRevoke?: string;
  createdAt: string;
  authorizedAt?: string;
  revokedAt?: string;
  updatedAt: string;
}

export interface InternalAgentResponse extends AgentResponse {
  privateKey?: string;
}
