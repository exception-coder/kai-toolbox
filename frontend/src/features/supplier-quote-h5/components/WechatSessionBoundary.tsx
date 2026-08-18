import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { SupplierQuoteGateway } from "../api/contract";
import { asGatewayError } from "../api/contract";
import { H5Frame } from "./H5Frame";
import {
  IdentityHandshake,
  type IdentityHandshakePhase,
} from "./IdentityHandshake";
import { StatePanel } from "./StatePanel";
import { isLocalDevelopmentHost } from "../runtime/localDevelopment";
import {
  completeWechatOAuthRedirect,
  hasPendingWechatOAuthRedirect,
  markWechatOAuthRedirect,
  recordWechatAuthDebug,
} from "../runtime/wechatAuthDebug";

interface WechatSessionBoundaryProps {
  gateway: SupplierQuoteGateway;
  brandName: string;
  buildPath: (path: string) => string;
  children: ReactNode;
}

export function WechatSessionBoundary(props: WechatSessionBoundaryProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<{
    ready: boolean;
    error: string | null;
    phase: IdentityHandshakePhase;
  }>({
    ready: false,
    error: null,
    phase: "CONNECTING",
  });
  const returnTo = `${location.pathname}${location.search}`;
  const localDevelopment = isLocalDevelopmentHost(window.location.hostname);

  useEffect(() => {
    const controller = new AbortController();
    recordWechatAuthDebug("info", "请求微信会话状态", returnTo);
    const verifyingTimer = globalThis.setTimeout(() => {
      setState((current) =>
        current.error || current.ready
          ? current
          : { ...current, phase: "VERIFYING" },
      );
    }, 180);
    let readyTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const watchdog = globalThis.setTimeout(() => {
      controller.abort();
      setState({
        ready: false,
        error: "报价服务响应超时，请确认 Forge 后端已启动",
        phase: "CONNECTING",
      });
    }, 9_000);
    props.gateway
      .getWechatSession(returnTo, controller.signal)
      .then((session) => {
        globalThis.clearTimeout(watchdog);
        globalThis.clearTimeout(verifyingTimer);
        if (!session.authenticated) {
          if (localDevelopment) {
            recordWechatAuthDebug("warning", "本地测试环境跳过微信授权", window.location.hostname);
            navigate(
              `${props.buildPath("/bind-account")}?returnTo=${encodeURIComponent(returnTo)}`,
              { replace: true },
            );
            return;
          }
          if (!session.authorizeUrl) throw new Error("授权入口缺失");
          markWechatOAuthRedirect();
          recordWechatAuthDebug("info", "准备跳转微信静默授权", "scope=snsapi_base");
          window.location.assign(session.authorizeUrl);
          return;
        }
        if (hasPendingWechatOAuthRedirect()) {
          completeWechatOAuthRedirect();
          recordWechatAuthDebug("success", "微信静默授权已完成", "授权会话验证成功");
        } else {
          recordWechatAuthDebug("success", "检测到已有微信会话", "本次访问未重新发起 OAuth");
        }
        if (!session.bound) {
          recordWechatAuthDebug("warning", "微信身份尚未关联业务账号");
          navigate(
            `${props.buildPath("/bind-account")}?returnTo=${encodeURIComponent(returnTo)}`,
            { replace: true },
          );
          return;
        }
        recordWechatAuthDebug("success", "微信身份与业务账号均已确认", session.binding?.sourceSystem);
        setState({ ready: false, error: null, phase: "READY" });
        const reducedMotion = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        readyTimer = globalThis.setTimeout(
          () => setState({ ready: true, error: null, phase: "READY" }),
          reducedMotion ? 80 : 320,
        );
      })
      .catch((error) => {
        globalThis.clearTimeout(watchdog);
        globalThis.clearTimeout(verifyingTimer);
        const normalized = asGatewayError(error);
        if (normalized.errorCode !== "REQUEST_ABORTED")
          recordWechatAuthDebug("error", "微信会话检查失败", normalized.message);
        if (normalized.errorCode !== "REQUEST_ABORTED")
          setState({
            ready: false,
            error: normalized.message,
            phase: "CONNECTING",
          });
      });
    return () => {
      globalThis.clearTimeout(watchdog);
      globalThis.clearTimeout(verifyingTimer);
      if (readyTimer !== undefined) globalThis.clearTimeout(readyTimer);
      controller.abort();
    };
  }, [localDevelopment, navigate, props.buildPath, props.gateway, returnTo]);

  if (state.ready) return props.children;
  if (!state.error) {
    return (
      <H5Frame
        brandName={props.brandName}
        currentStep={state.phase === "READY" ? 2 : 1}
        immersive
      >
        <IdentityHandshake phase={state.phase} />
      </H5Frame>
    );
  }
  return (
    <H5Frame
      brandName={props.brandName}
      currentStep={1}
      title="暂时无法准备报价单"
      description="连接未能完成，您可以重新尝试。"
    >
      <StatePanel
        tone="error"
        contextTag="连接异常"
        title="暂时无法确认身份"
        description={state.error}
        action={{ label: "重新尝试", onClick: () => window.location.reload() }}
      />
    </H5Frame>
  );
}
