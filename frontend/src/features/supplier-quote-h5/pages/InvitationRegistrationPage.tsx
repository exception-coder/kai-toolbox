import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Building, CheckCircle2, MessageSquareText, ShieldCheck } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { H5Frame } from '../components/H5Frame'
import { FieldShell, H5Input } from '../components/FormField'
import { StatePanel } from '../components/StatePanel'
import {
  asGatewayError,
  createIdempotencyKey,
  type GatewayError,
  type RegistrationDefaults,
  type RegistrationInvitation,
  type SupplierQuoteGateway,
} from '../api/contract'
import { cn } from '@/lib/utils'

interface RegistrationPageProps {
  gateway: SupplierQuoteGateway
  brandName: string
  demo: boolean
  buildPath: (path: string) => string
}

type FormErrors = Partial<Record<keyof RegistrationDefaults | 'verificationCode' | 'acceptedTerms', string>>

export function InvitationRegistrationPage(props: RegistrationPageProps) {
  const { inviteTicket = '' } = useParams<{ inviteTicket: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const registration = useInvitationRegistration(props.gateway, inviteTicket)

  const handleCompleted = (returnPath: string | null) => {
    const requestedReturn = searchParams.get('returnTo')
    navigate(props.buildPath(requestedReturn || returnPath || '/q/demo-quote'), { replace: true })
  }

  return (
    <H5Frame
      brandName={props.brandName}
      currentStep={1}
      badge="企业联系人登记"
      title="供应商身份核验与登记"
      description="核对受邀企业与联系人信息。登记成功后将自动绑定当前账号，后续进入报价无需重复核验。"
    >
      {registration.loading && (
        <StatePanel
          tone="loading"
          contextTag="核验中"
          title="正在核验邀请凭证"
          description="正在确认邀请有效期及企业联系人档案…"
        />
      )}
      {registration.error && <RegistrationError error={registration.error} onRetry={registration.reload} />}
      {registration.invitation && (
        <RegistrationContent
          {...props}
          ticket={inviteTicket}
          invitation={registration.invitation}
          onCompleted={handleCompleted}
        />
      )}
    </H5Frame>
  )
}

function RegistrationContent({
  gateway,
  demo,
  ticket,
  invitation,
  onCompleted,
}: RegistrationPageProps & {
  ticket: string
  invitation: RegistrationInvitation
  onCompleted: (returnPath: string | null) => void
}) {
  const [form, setForm] = useState(() => ({ ...invitation.defaults, verificationCode: '', acceptedTerms: false }))
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const codeSender = useVerificationCodeSender(gateway, ticket)

  const update = (field: keyof typeof form, value: string | boolean) => {
    setForm(current => ({ ...current, [field]: value }))
    setErrors(current => ({ ...current, [field]: undefined }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateRegistration(form, invitation.verificationRequired)
    if (Object.keys(nextErrors).length > 0) return setErrors(nextErrors)
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await gateway.registerWithInvitation({
        ...form,
        invitationTicket: ticket,
        idempotencyKey: createIdempotencyKey(),
      })
      onCompleted(result.returnPath)
    } catch (error) {
      const normalized = asGatewayError(error)
      setSubmitError(normalized.message)
      if (normalized.errorCode === 'VERIFICATION_CODE_INVALID') {
        setErrors(current => ({ ...current, verificationCode: normalized.message }))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Invitation Info Section */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Building className="size-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-800">受邀企业信息</span>
        </div>
        <div className="mt-3">
          <h2 className="text-base font-semibold text-slate-900">{invitation.supplier.displayName}</h2>
          <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-3">
            <div>
              <span className="text-slate-400">预留联系人：</span>
              <span className="font-medium text-slate-800">{invitation.contact.displayName}</span>
            </div>
            <div>
              <span className="text-slate-400">预留手机：</span>
              <span className="font-medium text-slate-800">{invitation.contact.maskedMobile ?? '未配置'}</span>
            </div>
            <div>
              <span className="text-slate-400">有效期至：</span>
              <span className="font-medium text-slate-800">{formatDateTime(invitation.expiresAt)}</span>
            </div>
          </div>
        </div>

        {demo && (
          <div className="mt-3.5 flex items-center gap-1.5 rounded-lg border border-amber-200/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span className="font-semibold">💡 演示环境：</span>
            <span>短信验证码固定为</span>
            <span className="font-mono font-bold text-amber-900">123456</span>
          </div>
        )}
      </section>

      {/* Registration Form Section */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-6">
        <form className="space-y-4" onSubmit={submit} noValidate>
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-900">确认并完善联系人信息</h3>
            <p className="mt-0.5 text-xs text-slate-500">请核对您的姓名与联系方式，用于后续业务往来与报价通知。</p>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <FieldShell label="姓名" htmlFor="registration-name" required error={errors.name}>
              <H5Input
                id="registration-name"
                autoComplete="name"
                hasError={Boolean(errors.name)}
                value={form.name}
                onChange={event => update('name', event.target.value)}
              />
            </FieldShell>

            <FieldShell label="手机号" htmlFor="registration-mobile" required error={errors.mobile}>
              <H5Input
                id="registration-mobile"
                inputMode="tel"
                autoComplete="tel"
                hasError={Boolean(errors.mobile)}
                value={form.mobile}
                onChange={event => update('mobile', event.target.value)}
              />
            </FieldShell>

            <FieldShell label="公司名称" htmlFor="registration-company" required error={errors.companyName}>
              <H5Input
                id="registration-company"
                hasError={Boolean(errors.companyName)}
                value={form.companyName}
                onChange={event => update('companyName', event.target.value)}
              />
            </FieldShell>

            <FieldShell label="职位 / 部门" htmlFor="registration-position" hint="选填" error={errors.position}>
              <H5Input
                id="registration-position"
                value={form.position}
                placeholder="例如：业务主管"
                onChange={event => update('position', event.target.value)}
              />
            </FieldShell>
          </div>

          {invitation.verificationRequired && (
            <VerificationCodeField
              form={form}
              error={errors.verificationCode}
              sender={codeSender}
              onChange={value => update('verificationCode', value)}
            />
          )}

          <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3">
            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-slate-600">
              <input
                type="checkbox"
                className="mt-0.5 size-3.5 rounded border-slate-300 text-slate-900 focus:ring-1 focus:ring-slate-800"
                checked={form.acceptedTerms}
                onChange={event => update('acceptedTerms', event.target.checked)}
              />
              <span>我确认上述信息属实，并同意将当前账号与该企业联系人绑定，用于协同报价与商务通知。</span>
            </label>
          </div>

          {errors.acceptedTerms && (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {errors.acceptedTerms}
            </p>
          )}

          {submitError && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              {submitError}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="h-10 w-full rounded-lg bg-slate-900 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
          >
            {submitting ? '正在登记…' : '确认登记并进入报价'}
            {!submitting && <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />}
          </Button>
        </form>
      </section>
    </div>
  )
}

function VerificationCodeField({
  form,
  error,
  sender,
  onChange,
}: {
  form: { verificationCode: string }
  error?: string
  sender: ReturnType<typeof useVerificationCodeSender>
  onChange: (value: string) => void
}) {
  return (
    <FieldShell
      label="短信验证码"
      htmlFor="registration-code"
      required
      hint={sender.maskedMobile ? `验证码将发至 ${sender.maskedMobile}` : undefined}
      error={error || sender.error || undefined}
    >
      <div className="flex gap-2">
        <H5Input
          id="registration-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          hasError={Boolean(error || sender.error)}
          value={form.verificationCode}
          placeholder="请输入 6 位验证码"
          onChange={event => onChange(event.target.value.replace(/\D/g, ''))}
        />
        <Button
          type="button"
          variant="outline"
          disabled={sender.sending || sender.cooldown > 0}
          className="h-10 shrink-0 rounded-lg border-slate-200 px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          onClick={sender.send}
        >
          <MessageSquareText aria-hidden="true" className="mr-1.5 size-3.5 text-slate-500" />
          {sender.cooldown > 0 ? `${sender.cooldown}s` : sender.sending ? '发送中…' : '获取验证码'}
        </Button>
      </div>
    </FieldShell>
  )
}

function useInvitationRegistration(gateway: SupplierQuoteGateway, ticket: string) {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<{
    loading: boolean
    invitation: RegistrationInvitation | null
    error: GatewayError | null
  }>({ loading: true, invitation: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    setState({ loading: true, invitation: null, error: null })
    gateway
      .getRegistrationInvitation(ticket, controller.signal)
      .then(invitation => setState({ loading: false, invitation, error: null }))
      .catch(error => {
        const normalized = asGatewayError(error)
        if (normalized.errorCode !== 'REQUEST_ABORTED') setState({ loading: false, invitation: null, error: normalized })
      })
    return () => controller.abort()
  }, [gateway, ticket, reloadKey])

  return { ...state, reload: () => setReloadKey(value => value + 1) }
}

function useVerificationCodeSender(gateway: SupplierQuoteGateway, invitationTicket: string) {
  const [sending, setSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [maskedMobile, setMaskedMobile] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  const send = useCallback(async () => {
    setSending(true)
    setError(null)
    try {
      const receipt = await gateway.sendVerificationCode({ invitationTicket, scene: 'REGISTRATION' })
      setCooldown(receipt.cooldownSeconds)
      setMaskedMobile(receipt.maskedMobile)
    } catch (sendError) {
      setError(asGatewayError(sendError).message)
    } finally {
      setSending(false)
    }
  }, [gateway, invitationTicket])

  return { sending, cooldown, maskedMobile, error, send }
}

function RegistrationError({ error, onRetry }: { error: GatewayError; onRetry: () => void }) {
  const retryable = error.errorCode === 'NETWORK_ERROR'
  return (
    <StatePanel
      tone={retryable ? 'error' : 'warning'}
      contextTag="邀请异常"
      title="邀请链接无效或已失效"
      description={error.message || '当前邀请链接不存在、已过期或已被其他账号使用。'}
      metaTrace={`错误代码: ${error.errorCode} · 状态: ${error.status}`}
      action={retryable ? { label: '重新核验', onClick: onRetry } : undefined}
    />
  )
}

function validateRegistration(
  form: RegistrationDefaults & { verificationCode: string; acceptedTerms: boolean },
  verificationRequired: boolean,
): FormErrors {
  const errors: FormErrors = {}
  if (!form.name.trim()) errors.name = '请输入姓名'
  if (!/^1\d{10}$/.test(form.mobile)) errors.mobile = '请输入正确的11位手机号'
  if (!form.companyName.trim()) errors.companyName = '请输入公司名称'
  if (verificationRequired && !/^\d{6}$/.test(form.verificationCode)) errors.verificationCode = '请输入6位验证码'
  if (!form.acceptedTerms) errors.acceptedTerms = '请先勾选同意账号绑定说明'
  return errors
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
