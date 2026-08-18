import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import type { MarketQuoteItem, SupplierQuoteGateway } from "../api/contract";
import { SupplierQuotationPage } from "./SupplierQuotationPage";

afterEach(cleanup);

describe("SupplierQuotationPage summary", () => {
  it("counts distinct quote tasks instead of treating them as completed items", async () => {
    const items = [
      quoteItem("1", "APPROVED", false),
      quoteItem("2", "APPROVED", false),
      quoteItem("3", "REQUOTE", true),
    ];
    const gateway = {
      getMarketQuotePage: vi.fn(async () => ({
        items,
        total: 3,
        pendingCount: 1,
        pageNo: 1,
        pageSize: 50,
      })),
    } as unknown as SupplierQuoteGateway;

    render(
      <ConfirmProvider>
        <SupplierQuotationPage gateway={gateway} brandName="Regen-tech" />
      </ConfirmProvider>,
    );

    const summary = await screen.findByRole("region", { name: "本轮询价进度" });
    expect(within(summary).getByText("1", { exact: true })).toBeInTheDocument();
    expect(within(summary).getByText("/ 3", { exact: true })).toBeInTheDocument();
    expect(within(summary).getByText("待报价 1")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "待重报 1" })).toBeInTheDocument();
  });

  it("does not count pending-audit or approved records as quote tasks", async () => {
    const gateway = {
      getMarketQuotePage: vi.fn(async () => ({
        items: [
          quoteItem("1", "PENDING_AUDIT", false),
          quoteItem("2", "APPROVED", false),
          quoteItem("3", "APPROVED", false),
        ],
        total: 3,
        pendingCount: 0,
        pageNo: 1,
        pageSize: 50,
      })),
    } as unknown as SupplierQuoteGateway;

    render(
      <ConfirmProvider>
        <SupplierQuotationPage gateway={gateway} brandName="Regen-tech" />
      </ConfirmProvider>,
    );

    const summary = await screen.findByRole("region", { name: "本轮询价进度" });
    expect(within(summary).getByText("0", { exact: true })).toBeInTheDocument();
    expect(within(summary).getByText("/ 3", { exact: true })).toBeInTheDocument();
    expect(within(summary).getByText("无需报价")).toBeInTheDocument();
  });
});

function quoteItem(
  supcId: string,
  status: MarketQuoteItem["status"],
  haveTask: boolean,
): MarketQuoteItem {
  return {
    supcId,
    productId: supcId,
    productCode: `P-${supcId}`,
    productName: `测试纱线 ${supcId}`,
    colorCode: "0#",
    colorName: "胚纱",
    colorGrade: "1",
    certification: null,
    lastQuotedAt: null,
    lastPriceIncludeTax: null,
    lastPriceExcludeTax: null,
    status,
    auditReason: null,
    haveTask,
    canQuote: status === "PENDING_QUOTE" || status === "REQUOTE",
    canRevoke: status === "PENDING_AUDIT",
  };
}
