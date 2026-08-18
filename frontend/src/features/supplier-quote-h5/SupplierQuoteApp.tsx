import { useCallback } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { H5Frame } from "./components/H5Frame";
import { StatePanel } from "./components/StatePanel";
import { WechatSessionBoundary } from "./components/WechatSessionBoundary";
import { WechatAuthDebugPanel } from "./components/WechatAuthDebugPanel";
import { InvitationRegistrationPage } from "./pages/InvitationRegistrationPage";
import { BusinessAccountBindingPage } from "./pages/BusinessAccountBindingPage";
import { SupplierQuotationPage } from "./pages/SupplierQuotationPage";
import { SubscriptionNotificationAdminPage } from "./pages/SubscriptionNotificationAdminPage";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import type { SupplierQuoteGateway } from "./api/contract";
import "./supplier-quote.css";

export interface SupplierQuoteAppProps {
  gateway: SupplierQuoteGateway;
  routeBase?: string;
  brandName?: string;
  demo?: boolean;
}

export function SupplierQuoteApp({
  gateway,
  routeBase = "",
  brandName = "织联协同",
  demo = false,
}: SupplierQuoteAppProps) {
  return (
    <ConfirmProvider>
      <SupplierQuoteRoutes
        gateway={gateway}
        routeBase={routeBase}
        brandName={brandName}
        demo={demo}
      />
      <WechatAuthDebugPanel />
    </ConfirmProvider>
  );
}

function SupplierQuoteRoutes({
  gateway,
  routeBase = "",
  brandName = "织联协同",
  demo = false,
}: SupplierQuoteAppProps) {
  const normalizedBase = routeBase.replace(/\/$/, "");
  const buildPath = useCallback(
    (path: string) =>
      `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`,
    [normalizedBase],
  );
  return (
    <Routes>
      <Route path="notifications" element={<SubscriptionNotificationAdminPage gateway={gateway} />} />
      <Route
        path="register/:inviteTicket"
        element={
          <InvitationRegistrationPage
            gateway={gateway}
            brandName={brandName}
            demo={demo}
            buildPath={buildPath}
          />
        }
      />
      <Route
        path="bind-account"
        element={
          <BusinessAccountBindingPage
            gateway={gateway}
            brandName={brandName}
            buildPath={buildPath}
          />
        }
      />
      <Route
        path="bind-scm"
        element={
          <BusinessAccountBindingPage
            gateway={gateway}
            brandName={brandName}
            buildPath={buildPath}
          />
        }
      />
      <Route
        path="q/:quoteTicket"
        element={
          <WechatSessionBoundary
            gateway={gateway}
            brandName={brandName}
            buildPath={buildPath}
          >
            <SupplierQuotationPage gateway={gateway} brandName={brandName} />
          </WechatSessionBoundary>
        }
      />
      <Route
        path="market-quotes"
        element={
          <WechatSessionBoundary
            gateway={gateway}
            brandName={brandName}
            buildPath={buildPath}
          >
            <SupplierQuotationPage gateway={gateway} brandName={brandName} />
          </WechatSessionBoundary>
        }
      />
      <Route
        index
        element={<Navigate replace to={buildPath("/market-quotes")} />}
      />
      <Route
        path="*"
        element={
          <NotFoundFallback
            brandName={brandName}
            demoPath={buildPath("/market-quotes")}
          />
        }
      />
    </Routes>
  );
}

function NotFoundFallback({
  brandName,
  demoPath,
}: {
  brandName: string;
  demoPath: string;
}) {
  const navigate = useNavigate();
  return (
    <H5Frame
      brandName={brandName}
      currentStep={1}
      title="页面地址无效"
      description="请从采购方发送的专属邀请或报价通知重新进入。"
    >
      <StatePanel
        tone="warning"
        contextTag="路由错误"
        title="没有找到对应的报价或登记入口"
        description="当前访问的链接地址格式不正确，或专属凭证参数已丢失。"
        metaTrace="错误代码: ROUTE_NOT_FOUND (404)"
        action={{
          label: "返回市场报价",
          onClick: () => navigate(demoPath),
        }}
        secondaryAction={{
          label: "返回系统首页",
          onClick: () => navigate("/"),
        }}
      />
    </H5Frame>
  );
}
