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
            navigate(
              `${props.buildPath("/bind-account")}?returnTo=${encodeURIComponent(returnTo)}`,
              { replace: true },
            );
            return;
          }
          if (!session.authorizeUrl) throw new Error("授权入口缺失");
          window.location.assign(session.authorizeUrl);
          return;
        }
        if (!session.bound) {
          navigate(
            `${props.buildPath("/bind-account")}?returnTo=${encodeURIComponent(returnTo)}`,
            { replace: true },
          );
          return;
        }
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
