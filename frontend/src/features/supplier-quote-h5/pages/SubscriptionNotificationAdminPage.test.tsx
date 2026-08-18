import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupplierQuoteGateway } from "../api/contract";
import { SubscriptionNotificationAdminPage } from "./SubscriptionNotificationAdminPage";

afterEach(cleanup);

describe("SubscriptionNotificationAdminPage", () => {
  it("shows one row per user and remaining over total subscriptions", async () => {
    const gateway = {
      getSubscriptionUsers: vi.fn(async () => ({
        items: [{
          userKey: 4,
          accountLabel: "huafu",
          supplierName: "111002华孚",
          availableCount: 2,
          totalCount: 4,
          latestCreatedAt: Date.now(),
          latestResultCode: null,
          latestResultMessage: null,
          bound: true,
        }],
        availableCount: 2,
        totalCount: 4,
      })),
    } as unknown as SupplierQuoteGateway;

    render(<SubscriptionNotificationAdminPage gateway={gateway} />);

    expect(await screen.findByText("huafu")).toBeInTheDocument();
    expect(screen.getByText("共 1 人")).toBeInTheDocument();
    expect(screen.getAllByText("/ 4")).toHaveLength(2);
    expect(screen.queryByText("报价凭证")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("demo-quote")).not.toBeInTheDocument();
  });

  it("shows an explicit success message after sending", async () => {
    const gateway = createGateway({ status: "SENT", resultCode: "0", resultMessage: "ok" });

    render(<SubscriptionNotificationAdminPage gateway={gateway} />);
    fireEvent.click(await screen.findByRole("button", { name: "一键推送" }));

    expect(await screen.findByRole("status")).toHaveTextContent("通知发送成功，已消耗 1 次推送机会");
  });

  it("shows the WeChat result when the request completes with a business failure", async () => {
    const gateway = createGateway({ status: "FAILED", resultCode: "43101", resultMessage: "用户拒绝接受消息" });

    render(<SubscriptionNotificationAdminPage gateway={gateway} />);
    fireEvent.click(await screen.findByRole("button", { name: "一键推送" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("43101 · 用户拒绝接受消息");
    expect(screen.getByRole("alert")).toHaveTextContent("本次机会仍可重试");
  });
});

function createGateway(result: { status: "SENT" | "FAILED"; resultCode: string; resultMessage: string }) {
  return {
    getSubscriptionUsers: vi.fn(async () => ({
      items: [{
        userKey: 4,
        accountLabel: "jili1",
        supplierName: "3275吉丽织厂",
        availableCount: 2,
        totalCount: 4,
        latestCreatedAt: Date.now(),
        latestResultCode: null,
        latestResultMessage: null,
        bound: true,
      }],
      availableCount: 2,
      totalCount: 4,
    })),
    sendSubscriptionToUser: vi.fn(async () => ({ grantId: 1, ...result })),
  } as unknown as SupplierQuoteGateway;
}
