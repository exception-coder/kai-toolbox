import { http } from "@/lib/api";

export type AgentVersionStatus = "PRODUCTION" | "CANDIDATE" | "HISTORICAL";
export type OrchestrationVersion = "v1" | "v2" | "v3" | "v4";
export type CapabilityType = "MCP_SERVER" | "TOOL" | "SKILL";

export interface AgentCapability {
  id: string;
  name: string;
  type: CapabilityType;
  version: string;
  source: string;
  description: string;
  permission: "READ_ONLY" | "INSTRUCTION_ONLY";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  availability: "REGISTERED" | "DEGRADED" | "UNAVAILABLE";
  availabilityBasis: string;
  providedCapabilityIds: string[];
}

export interface AgentVersion {
  version: number;
  status: AgentVersionStatus;
  model: string;
  temperature: number;
  promptRef: string;
  orchestrationVersion: OrchestrationVersion;
  tools: string[];
  mcpServers: string[];
  skills: string[];
  evaluationRunId: string | null;
  evaluationScore: number | null;
  evaluationPassed: boolean;
  createdAt: number;
  releasedAt: number | null;
}

export interface AgentEvaluationCase {
  id: string;
  title: string;
  question: string;
  coverage: string;
  status: "READY" | "SOURCE_MISSING";
}

export interface AgentEvaluationDataset {
  id: string;
  name: string;
  baselineStatus: "PENDING_HUMAN_BASELINE";
  cases: AgentEvaluationCase[];
}

export interface AgentManagementSnapshot {
  id: string;
  name: string;
  owner: string;
  description: string;
  endpoint: string;
  framework: string;
  observabilityUrl: string | null;
  productionVersion: AgentVersion | null;
  candidateVersion: AgentVersion | null;
  versions: AgentVersion[];
  capabilityRegistry?: AgentCapability[];
  productionCapabilityIds?: string[];
  candidateCapabilityIds?: string[];
  evaluationDataset?: AgentEvaluationDataset;
  releaseGate: { releasable: boolean; minimumScore: number; reason: string };
}

export interface AgentDefinition {
  id: string;
  name: string;
  owner: string;
  description: string;
  endpoint: string;
  framework: string;
  observabilityUrl: string | null;
}

export interface CreateAgentVersionRequest {
  model: string;
  temperature: number;
  promptRef: string;
  orchestrationVersion: OrchestrationVersion;
  tools: string[];
  mcpServers: string[];
  skills: string[];
  evaluationRunId?: string | null;
  evaluationScore?: number | null;
  evaluationPassed?: boolean;
}

const BASE_PATH = "/fore-consult/agents";

export const listAgents = () => http<AgentDefinition[]>(BASE_PATH);

export const getAgent = (agentId: string) =>
  http<AgentManagementSnapshot>(`${BASE_PATH}/${agentId}`);

export function createAgentCandidate(
  agentId: string,
  request: CreateAgentVersionRequest,
) {
  return http<AgentManagementSnapshot>(`${BASE_PATH}/${agentId}/versions`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function releaseAgentCandidate(agentId: string, version: number) {
  return http<AgentManagementSnapshot>(
    `${BASE_PATH}/${agentId}/versions/${version}/release`,
    { method: "POST" },
  );
}

export function rollbackAgentVersion(agentId: string, version: number) {
  return http<AgentManagementSnapshot>(
    `${BASE_PATH}/${agentId}/versions/${version}/rollback`,
    { method: "POST" },
  );
}
