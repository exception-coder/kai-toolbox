import { http } from "@/lib/api";

export const TEACHING_AGENT_ID = "order-draft-teaching";
const BASE = "/fore-consult/agents/order-draft-teaching/teaching";
export interface TeachingConfig {
  model: string; temperature: number; prompt: string; maxQuantity: number;
  maxIterations: number; timeoutSeconds: number; retries: number; maxOutputTokens: number; lookupEnabled: boolean;
}
export interface OrderDraft {
  contractVersion: string; styleCode: string | null; sku: string | null;
  quantity: number | null; status: string; issues: string[];
}
export interface Scenario {
  id: string; title: string; input: string; style: string; quantity: number | null;
  previous: OrderDraft | null; expectedStatus: string; expectedSku: string | null; expectedQuantity: number | null;
}
export interface Run {
  id: string; version: number; mode: "DEMO" | "LIVE"; input: string; status: string; answer: string;
  draft: OrderDraft | null; steps: { elapsedMs: number; type: string; detail: string }[];
  elapsedMs: number; tokens: number | null; createdAt: number;
}
export interface Evaluation {
  id: string; version: number; mode: "DEMO" | "LIVE"; score: number; passed: boolean; createdAt: number;
  cases: { scenario: Scenario; actual: Run; differences: string[] }[];
}
export interface TeachingSnapshot {
  version: number; config: TeachingConfig; liveAvailable: boolean;
  scenarios: Scenario[]; runs: Run[]; evaluations: Evaluation[];
}
export const getTeaching = (version?: number) => http<TeachingSnapshot>(BASE + (version ? `?version=${version}` : ""));
export const saveTeaching = (config: TeachingConfig) =>
  http<TeachingSnapshot>(`${BASE}/versions`, { method: "POST", body: JSON.stringify(config) });
export const runTeaching = (request: {
  version: number; mode: "DEMO" | "LIVE"; scenarioId: string; input: string; previous: OrderDraft | null;
}) => http<Run>(`${BASE}/runs`, { method: "POST", body: JSON.stringify(request) });
export const evaluateTeaching = (version: number, mode: "DEMO" | "LIVE") =>
  http<Evaluation>(`${BASE}/evaluations`, { method: "POST", body: JSON.stringify({ version, mode }) });
