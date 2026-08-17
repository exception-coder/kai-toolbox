import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { asGatewayError, type SupplierQuoteGateway } from "../api/contract";
import { FieldShell, H5Input } from "../components/FormField";
import { H5Frame } from "../components/H5Frame";
import { StatePanel } from "../components/StatePanel";
import { isLocalDevelopmentHost } from "../runtime/localDevelopment";

interface BusinessAccountBindingPageProps {
  gateway: SupplierQuoteGateway;
  brandName: string;
  buildPath: (path: string) => string;
}

export function BusinessAccountBindingPage(
  props: BusinessAccountBindingPageProps,
) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = safeClientReturn(
    searchParams.get("returnTo"),
    props.buildPath("/q/demo-quote"),
  );
  const localDevelopment = isLocalDevelopmentHost(window.location.hostname);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ username: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    props.gateway
      .getWechatSession(returnTo, controller.signal)
      .then((session) => {
        if (!session.authenticated) {
          if (localDevelopment) {
            setChecking(false);
            return;
          }
          if (!session.authorizeUrl) throw new Error("授权入口缺失");
          window.location.assign(session.authorizeUrl);
          return;
        }
        if (session.bound) {
          navigate(returnTo, { replace: true });
          return;
        }
        setChecking(false);
      })
      .catch((fetchError) => {
        const normalized = asGatewayError(fetchError);
        if (normalized.errorCode !== "REQUEST_ABORTED") {
          setError(normalized.message);
          setChecking(false);
        }
      });
    return () => controller.abort();
  }, [localDevelopment, navigate, props.gateway, returnTo]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError("请输入公司业务账号和密码");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await props.gateway.bindBusinessAccount({
        ...form,
        username: form.username.trim(),
        returnTo,
      });
      setForm((current) => ({ ...current, password: "" }));
      navigate(result.returnTo, { replace: true });
    } catch (submitError) {
      setForm((current) => ({ ...current, password: "" }));
      setError(asGatewayError(submitError).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <H5Frame
      brandName={props.brandName}
      currentStep={1}
      badge="首次账号关联"
      title="关联您的公司业务账号"
      description="仅首次需要登录。校验成功后将关联公司业务账号并进入报价。"
    >
      {checking ? (
        <StatePanel
          tone="loading"
          contextTag="身份检查"
          title="正在确认微信授权状态"
          description="请稍候…"
        />
      ) : (
        <div>
          <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-6">
            <form className="space-y-4" onSubmit={submit} noValidate>
              <FieldShell label="业务账号" htmlFor="business-username" required>
                <div className="relative">
                  <UserRound
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400"
                  />
                  <H5Input
                    id="business-username"
                    autoComplete="username"
                    className="pl-9"
                    value={form.username}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                  />
                </div>
              </FieldShell>
              <FieldShell label="账号密码" htmlFor="business-password" required>
                <div className="relative">
                  <LockKeyhole
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400"
                  />
                  <H5Input
                    id="business-password"
                    type="password"
                    autoComplete="current-password"
                    className="pl-9"
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                  />
                </div>
              </FieldShell>

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700"
                >
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={submitting}
                className="h-10 w-full rounded-lg bg-slate-900 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
              >
                {submitting ? "正在校验并关联…" : "关联账号并进入报价"}
                {!submitting && (
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                )}
              </Button>
            </form>
          </section>
        </div>
      )}
    </H5Frame>
  );
}

function safeClientReturn(value: string | null, fallback: string) {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
    ? value
    : fallback;
}
