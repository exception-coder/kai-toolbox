import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentManagementSnapshot } from "../api";
import { TeachingAgentDetail } from "./TeachingAgentDetail";
import { getTeaching, runTeaching, saveTeaching, type TeachingSnapshot } from "./api";

vi.mock("./api", () => ({ getTeaching: vi.fn(), runTeaching: vi.fn(), saveTeaching: vi.fn(), evaluateTeaching: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const config = { model: "qwen-plus", temperature: 0.1, prompt: "请生成教学草稿", maxQuantity: 1000,
  maxIterations: 6, timeoutSeconds: 30, retries: 0, maxOutputTokens: 1024, lookupEnabled: true };
const scenario = { id: "complete", title: "完整订单", input: "订 A123，100 件", style: "A123", quantity: 100,
  previous: null, expectedStatus: "READY", expectedSku: "A123", expectedQuantity: 100 };
const snapshot: TeachingSnapshot = { version: 1, config, liveAvailable: false, scenarios: [scenario], runs: [], evaluations: [] };
const agent = { name: "订单草稿教学 Agent", versions: [{ version: 1, status: "CANDIDATE" }, { version: 2, status: "CANDIDATE" }] } as AgentManagementSnapshot;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TeachingAgentDetail agent={agent} /></QueryClientProvider>);
}

describe("Agent 管理教学详情", () => {
  it("shows six sections and prevents executing an unsaved configuration", async () => {
    vi.mocked(getTeaching).mockResolvedValue(snapshot);
    vi.mocked(saveTeaching).mockResolvedValue({ ...snapshot, version: 2, config: { ...config, maxQuantity: 50 } });
    mount();
    await screen.findByRole("heading", { name: agent.name });
    expect(screen.getByRole("navigation", { name: "教学 Agent 六块能力" }).children).toHaveLength(6);
    fireEvent.change(screen.getByLabelText("数量上限（Java 强制校验）"), { target: { value: "50" } });
    expect(screen.getByRole("button", { name: "运行已保存版本" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "保存候选版本" }));
    await waitFor(() => expect(saveTeaching).toHaveBeenCalledWith({ ...config, maxQuantity: 50 }, expect.anything()));
    await waitFor(() => expect(screen.getByRole("button", { name: "运行已保存版本" })).toBeEnabled());
  });

  it("retains input and offers recovery after an API failure", async () => {
    vi.mocked(getTeaching).mockResolvedValue(snapshot);
    vi.mocked(runTeaching).mockRejectedValue(new Error("网关暂不可用"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "运行已保存版本" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("网关暂不可用");
    expect(screen.getByLabelText("订单输入")).toHaveValue(scenario.input);
    expect(screen.getByRole("button", { name: "运行已保存版本" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "重试读取" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
