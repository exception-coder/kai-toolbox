import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierQuoteApp } from "./SupplierQuoteApp";
import type {
  QuotationAccess,
  RegistrationInvitation,
  SupplierQuoteGateway,
  WechatSession,
} from "./api/contract";

const pendingGateway: SupplierQuoteGateway = {
  getWechatSession: vi.fn(async () => ({
    authenticated: true,
    bound: true,
    authorizeUrl: null,
    binding: {
      accountId: "demo-account-001",
      username: "supplier-demo",
      displayName: "王经理",
      supplierId: "supplier-demo-001",
      supplierName: "广州睿程服饰有限公司",
      sourceSystem: "DEMO",
    },
  })),
  bindBusinessAccount: vi.fn(),
  getRegistrationInvitation: vi.fn(
    () => new Promise<RegistrationInvitation>(() => undefined),
  ),
  sendVerificationCode: vi.fn(),
  registerWithInvitation: vi.fn(),
  getQuotationAccess: vi.fn(
    () => new Promise<QuotationAccess>(() => undefined),
  ),
  saveDraft: vi.fn(),
  submitQuotation: vi.fn(),
  getMarketQuotePage: vi.fn(async () => ({
    items: [],
    total: 0,
    pendingCount: 0,
    pageNo: 1,
    pageSize: 50,
  })),
  submitMarketQuote: vi.fn(),
  submitMarketQuotes: vi.fn(),
  revokeMarketQuote: vi.fn(),
  getYarnQualityStandards: vi.fn(),
  getSubscriptionGrants: vi.fn(async () => ({ items: [], availableCount: 0 })),
  getSubscriptionUsers: vi.fn(async () => ({ items: [], availableCount: 0, totalCount: 0 })),
  sendSubscription: vi.fn(),
  sendSubscriptionToUser: vi.fn(),
};

afterEach(cleanup);

describe("SupplierQuoteApp routes", () => {
  it("presents the WeChat session as a quote preparation flow", () => {
    const slowSessionGateway: SupplierQuoteGateway = {
      ...pendingGateway,
      getWechatSession: vi.fn(
        () => new Promise<WechatSession>(() => undefined),
      ),
    };

    render(
      <MemoryRouter initialEntries={["/q/demo-quote"]}>
        <SupplierQuoteApp gateway={slowSessionGateway} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "正在准备您的报价单" }),
    ).toBeInTheDocument();
    expect(screen.getByText("建立安全连接")).toBeInTheDocument();
    expect(screen.getByText("获取本轮询价")).toBeInTheDocument();
    expect(screen.getByText("准备报价页面")).toBeInTheDocument();
    expect(screen.queryByText(/公众号静默授权/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "授权诊断" }),
    ).toBeInTheDocument();
  });

  it("opens account binding directly on a local host when WeChat is unauthenticated", async () => {
    const localGateway: SupplierQuoteGateway = {
      ...pendingGateway,
      getWechatSession: vi.fn(async () => ({
        authenticated: false,
        bound: false,
        authorizeUrl: "https://open.weixin.qq.com/connect/oauth2/authorize",
        binding: null,
      })),
    };

    render(
      <MemoryRouter initialEntries={["/q/demo-quote"]}>
        <SupplierQuoteApp gateway={localGateway} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "关联您的公司业务账号" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "仅首次需要登录。校验成功后将关联公司业务账号并进入报价。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("本地开发模式")).not.toBeInTheDocument();
    expect(screen.queryByText(/验证账号/)).not.toBeInTheDocument();
  });

  it("matches the quotation entry when mounted below the Forge showcase route", async () => {
    render(
      <MemoryRouter initialEntries={["/showcase/supplier-quote/q/demo-quote"]}>
        <Routes>
          <Route
            path="/showcase/supplier-quote/*"
            element={
              <SupplierQuoteApp
                gateway={pendingGateway}
                routeBase="/showcase/supplier-quote"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "本轮询价" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("没有找到对应的报价或登记入口"),
    ).not.toBeInTheDocument();
  });

  it("keeps matching the standalone quotation entry at the domain root", async () => {
    render(
      <MemoryRouter initialEntries={["/q/demo-quote"]}>
        <SupplierQuoteApp gateway={pendingGateway} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "本轮询价" }),
    ).toBeInTheDocument();
  });

  it("opens the market quote worklist without another login page", async () => {
    render(
      <MemoryRouter initialEntries={["/showcase/supplier-quote/market-quotes"]}>
        <Routes>
          <Route
            path="/showcase/supplier-quote/*"
            element={
              <SupplierQuoteApp
                gateway={pendingGateway}
                routeBase="/showcase/supplier-quote"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "本轮询价" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "关联公司业务账号" }),
    ).not.toBeInTheDocument();
  });
});
