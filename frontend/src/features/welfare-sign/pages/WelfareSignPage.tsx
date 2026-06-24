import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Download, Eraser, Gift, Maximize2, PenLine, Plus, Save, Trash2, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import {
  createEmployee,
  deleteEmployee,
  getConfig,
  listEmployees,
  listRecords,
  login,
  saveConfig,
  sign,
  updateEmployee,
} from '../api'
import type { EmployeePayload, EmployeeView, ExtraField, LoginMode, SignRecordView, WelfareConfig } from '../types'
import '../styles.css'

const LUXURY_GIFT_IMAGE = '/assets/welfare-sign/duanwu-bg.svg'
const MOCK_LOGIN_ID = '13800000000'
const MOCK_CODE = '000000'
const MOCK_EMPLOYEE_ID = -1
const MOCK_CONFIG: WelfareConfig = {
  loginMode: 'SMS',
  redirectUrl: null,
  loginImageUrl: null,
  detailImageUrl: null,
  detailTitle: '\u7aef\u5348\u5b89\u5eb7',
  detailContent: '\u7cbd\u53f6\u98d8\u9999\uff0c\u7aef\u5348\u5c06\u81f3\uff0c\u4e00\u4efd\u6765\u81ea\u516c\u53f8\u7684\u5fc3\u610f\u5df2\u4e3a\u4f60\u5907\u597d\u3002\u8bf7\u786e\u8ba4\u6536\u53d6\uff0c\u5e76\u7559\u4e0b\u4f60\u7684\u7b7e\u540d\u3002',
  popupEnabled: true,
  popupTitle: '\u4e00\u4efd\u7aef\u5348\u7684\u5fc3\u610f',
  popupContent: '\u8bf7\u5728\u786e\u8ba4\u798f\u5229\u54c1\u4fe1\u606f\u540e\u5b8c\u6210\u7b7e\u540d\u3002\u7b7e\u6536\u8bb0\u5f55\u4ec5\u7528\u4e8e\u8d22\u52a1\u6838\u5bf9\u4e0e\u5408\u89c4\u7559\u5b58\u3002',
  signatureNotice: '\u672c\u4eba\u786e\u8ba4\u5df2\u6536\u5230\u672c\u6b21\u7aef\u5348\u8282\u798f\u5229\u54c1\u3002',
  extraFieldsJson: '[{"key":"address","label":"\\u6536\\u53d6\\u5730\\u70b9","required":false}]',
  updatedAt: Date.now(),
}
const MOCK_EMPLOYEE: EmployeeView = {
  id: MOCK_EMPLOYEE_ID,
  employeeNo: 'MOCK-001',
  name: '\u6d4b\u8bd5\u5458\u5de5',
  phone: MOCK_LOGIN_ID,
  account: 'mock',
  department: '\u96c6\u56e2\u603b\u90e8',
  extraJson: null,
  enabled: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  signed: false,
  signedAt: null,
}

function isMockLogin(loginId: string, password: string, config: WelfareConfig) {
  if (loginId.trim() !== MOCK_LOGIN_ID) return false
  return config.loginMode === 'PASSWORD' ? password === MOCK_CODE : true
}

const EMPTY_EMPLOYEE: EmployeePayload = {
  employeeNo: '',
  name: '',
  phone: '',
  account: '',
  password: '',
  department: '',
  extraJson: '',
  enabled: true,
}

export function WelfareSignPage({ fullscreen = false }: { fullscreen?: boolean }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'sign' | 'admin'>('sign')
  const [error, setError] = useState<string | null>(null)
  const configQuery = useQuery({ queryKey: ['welfare-sign-config'], queryFn: getConfig })
  const employeesQuery = useQuery({ queryKey: ['welfare-sign-employees'], queryFn: listEmployees })
  const recordsQuery = useQuery({ queryKey: ['welfare-sign-records'], queryFn: listRecords })
  const config = configQuery.data ?? MOCK_CONFIG

  const showError = (e: unknown) => setError(e instanceof ApiError ? e.message : String(e))

  return (
    <div className={`flex min-h-0 flex-col bg-[var(--color-muted)]/40 ${fullscreen ? 'h-[100dvh]' : 'h-[calc(100dvh-3.5rem)]'}`}>
      {!fullscreen && (
      <header className="border-b bg-[var(--color-background)] px-5 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
              <BadgeCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold">福利签收</h1>
              <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">白名单登录、福利详情确认、线上签名、财务核对导出</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
            <Button variant="outline" size="sm" onClick={() => window.open('/tools/welfare-sign/fullscreen', '_blank')}>
              <Maximize2 className="size-4" />
              全屏签收
            </Button>
            <div className="flex rounded-md border bg-[var(--color-card)] p-1">
              <Tab active={mode === 'sign'} onClick={() => setMode('sign')}>员工签收</Tab>
              <Tab active={mode === 'admin'} onClick={() => setMode('admin')}>后台管理</Tab>
            </div>
          </div>
        </div>
      </header>
      )}

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <main className={`min-h-0 flex-1 overflow-auto ${fullscreen ? 'p-0' : 'p-5'}`}>
        {fullscreen || mode === 'sign' ? (
          <SignDesk fullscreen={fullscreen} config={config} onError={showError} onDone={() => {
            void qc.invalidateQueries({ queryKey: ['welfare-sign-employees'] })
            void qc.invalidateQueries({ queryKey: ['welfare-sign-records'] })
          }} />
        ) : (
          <AdminDesk
            config={config}
            employees={employeesQuery.data ?? []}
            records={recordsQuery.data ?? []}
            onError={showError}
          />
        )}
      </main>
    </div>
  )
}

function SignDesk({ fullscreen, config, onError, onDone }: { fullscreen: boolean; config?: WelfareConfig; onError: (e: unknown) => void; onDone: () => void }) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [employee, setEmployee] = useState<EmployeeView | null>(null)
  const [activeConfig, setActiveConfig] = useState<WelfareConfig | undefined>(config ?? MOCK_CONFIG)
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [signature, setSignature] = useState('')
  const [doneUrl, setDoneUrl] = useState<string | null | undefined>(undefined)
  const [popupOpen, setPopupOpen] = useState(false)
  const fields = useMemo(() => parseFields(activeConfig?.extraFieldsJson), [activeConfig?.extraFieldsJson])
  const visual = activeConfig?.detailImageUrl || activeConfig?.loginImageUrl || LUXURY_GIFT_IMAGE
  const title = activeConfig?.detailTitle || config?.detailTitle || '端午福利签收'
  const content = activeConfig?.detailContent || config?.detailContent || '粽香端午，一份心意郑重送达。请完成确认，留下你的签名。'

  useEffect(() => {
    if (!activeConfig && config) setActiveConfig(config)
  }, [config, activeConfig])

  const loginMut = useMutation({
    mutationFn: async () => {
      if (isMockLogin(loginId, password, config ?? MOCK_CONFIG)) {
        return { employee: MOCK_EMPLOYEE, config: config ?? MOCK_CONFIG }
      }
      return login({ loginId, password, smsCode: MOCK_CODE })
    },
    onSuccess: r => {
      setEmployee(r.employee)
      setActiveConfig(r.config)
      setPopupOpen(r.config.popupEnabled)
    },
    onError,
  })
  const signMut = useMutation({
    mutationFn: async () => {
      if (employee?.id === MOCK_EMPLOYEE_ID) return { ok: true, redirectUrl: null }
      return sign({ employeeId: employee!.id, signatureData: signature, extra })
    },
    onSuccess: r => {
      onDone()
      setDoneUrl(r.redirectUrl)
    },
    onError,
  })

  if (doneUrl !== undefined) {
    return (
      <section className={luxuryFrameClass(fullscreen)}>
        <LuxuryBackdrop image={visual} />
        <div className="relative z-10 mx-auto flex min-h-[inherit] w-full max-w-4xl flex-col items-center justify-center px-6 py-16 text-center text-white">
          <UserCheck className="mb-8 size-12 text-[#6f9b54]" />
          <p className="mb-4 text-xs uppercase tracking-[0.45em] text-[#6f9b54]">Received</p>
          <h2 className="max-w-3xl text-5xl font-semibold leading-tight md:text-7xl">心意已妥善抵达</h2>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/62">你的签收记录已完成留存。感谢你在这一刻郑重确认。</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {doneUrl && <Button className="bg-[#5e8b46] text-[#0c160c] hover:bg-[#79a861]" onClick={() => { window.location.href = doneUrl }}>进入后续系统</Button>}
            <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => { setEmployee(null); setDoneUrl(undefined); setSignature(''); setExtra({}) }}>返回</Button>
          </div>
        </div>
      </section>
    )
  }

  if (!employee) {
    return (
      <section className={luxuryFrameClass(fullscreen)}>
        <LuxuryBackdrop image={visual} />
        <div className="relative z-10 mx-auto grid min-h-[inherit] w-full max-w-7xl items-center gap-10 px-6 py-12 text-white lg:grid-cols-[1.15fr_420px] lg:px-12">
          <div className="welfare-luxury-copy max-w-4xl">
            <p className="mb-6 text-xs uppercase tracking-[0.5em] text-[#6f9b54]">端午安康 · Dragon Boat Festival</p>
            <h2 className="max-w-4xl text-6xl font-semibold leading-[0.95] tracking-[-0.02em] md:text-8xl lg:text-9xl">
              {title}
            </h2>
            <p className="mt-8 max-w-2xl whitespace-pre-wrap text-lg leading-8 text-white/62 md:text-xl">
              {content}
            </p>
          </div>
          <section className="welfare-luxury-panel rounded-[2rem] border border-white/10 bg-[#0e1a12]/70 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/38">Private Reception</p>
                <h3 className="mt-2 text-2xl font-medium">确认身份</h3>
              </div>
              <Gift className="size-6 text-[#6f9b54]" />
            </div>
            <LuxuryInput label="员工编号 / 手机号 / 账号" value={loginId} onChange={setLoginId} />
            {config?.loginMode === 'PASSWORD' ? (
              <LuxuryInput label="密码" type="password" value={password} onChange={setPassword} />
            ) : (
              <LuxuryInput label="验证码" value={MOCK_CODE} readOnly onChange={() => {}} />
            )}
            <p className="mt-4 text-xs leading-5 text-white/38">测试账号 {MOCK_LOGIN_ID} · 验证码 {MOCK_CODE}</p>
            <button
              type="button"
              disabled={!loginId.trim() || loginMut.isPending}
              onClick={() => loginMut.mutate()}
              className="mt-7 h-12 w-full rounded-full bg-[#5e8b46] text-sm font-medium text-[#0c160c] transition hover:bg-[#79a861] disabled:cursor-not-allowed disabled:opacity-45"
            >
              领取端午福利
            </button>
          </section>
        </div>
      </section>
    )
  }

  return (
    <section className={luxuryFrameClass(fullscreen)}>
      <LuxuryBackdrop image={visual} />
      <div className="relative z-10 mx-auto grid min-h-[inherit] w-full max-w-7xl items-center gap-8 px-6 py-10 text-white lg:grid-cols-[1fr_460px] lg:px-12">
        <section className="welfare-luxury-copy max-w-4xl">
          <p className="mb-5 text-xs uppercase tracking-[0.45em] text-[#6f9b54]">{employee.department || 'Gift Reception'} · {employee.employeeNo}</p>
          <h2 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.02em] md:text-7xl lg:text-8xl">{title}</h2>
          <p className="mt-7 max-w-2xl whitespace-pre-wrap text-lg leading-8 text-white/62">{content}</p>
          <div className="mt-10 h-px w-32 bg-[#6f9b54]/60" />
          <p className="mt-6 text-sm text-white/48">For {employee.name}{employee.phone ? ` · ${employee.phone}` : ''}</p>
        </section>

        <section className="welfare-luxury-panel rounded-[2rem] border border-white/10 bg-[#0e1a12]/72 p-6 shadow-2xl shadow-black/45 backdrop-blur-xl">
        <h2 className="flex items-center gap-2 text-xl font-medium"><PenLine className="size-5 text-[#6f9b54]" />签名确认</h2>
        <p className="mt-2 text-sm leading-6 text-white/52">{activeConfig?.signatureNotice || '本人确认已收到上述福利品。'}</p>
        {fields.length > 0 && (
          <div className="mt-4 space-y-3">
            {fields.map(f => (
              <label key={f.key} className="block text-sm text-white/72">
                {f.label}{f.required ? ' *' : ''}
                <Input
                  className="mt-1 border-white/12 bg-white/8 text-white placeholder:text-white/25"
                  type={f.type ?? 'text'}
                  value={extra[f.key] ?? ''}
                  onChange={e => setExtra(v => ({ ...v, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        )}
        <SignaturePad value={signature} onChange={setSignature} />
        <Button
          className="mt-4 w-full rounded-full bg-[#5e8b46] text-[#0c160c] hover:bg-[#79a861]"
          disabled={!signature || signMut.isPending || fields.some(f => f.required && !extra[f.key]?.trim())}
          onClick={() => signMut.mutate()}
        >
          提交签收
        </Button>
      </section>
      </div>

      {popupOpen && activeConfig?.popupEnabled && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPopupOpen(false)}>
          <div className="w-full max-w-md rounded-[1.5rem] border border-white/10 bg-[#0e1a12] p-6 text-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-2xl font-semibold">{activeConfig.popupTitle || '签收提示'}</h3>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-white/60">{activeConfig.popupContent}</p>
            <Button className="mt-6 w-full bg-[#5e8b46] text-[#0c160c] hover:bg-[#79a861]" onClick={() => setPopupOpen(false)}>知道了</Button>
          </div>
        </div>
      )}
    </section>
  )
}

function luxuryFrameClass(fullscreen: boolean) {
  return `welfare-luxury-stage relative isolate overflow-hidden bg-[#08130d] ${fullscreen ? 'min-h-[100dvh]' : 'min-h-[calc(100dvh-10rem)] rounded-lg'}`
}

function LuxuryBackdrop({ image }: { image: string }) {
  return (
    <>
      <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-72" />
      <div className="absolute inset-0 bg-[#08130d]/56" />
      <div className="absolute inset-y-0 left-0 w-[70%] bg-[#08130d]/72" />
      <div className="welfare-luxury-glow absolute -left-32 top-20 h-72 w-72 rounded-full bg-[#6f9b54]/20 blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-[#08130d]/80" />
    </>
  )
}

function LuxuryInput({ label, value, onChange, type = 'text', readOnly = false }: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  readOnly?: boolean
}) {
  return (
    <label className="mt-4 block text-xs uppercase tracking-[0.22em] text-white/38">
      {label}
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={e => onChange(e.target.value)}
        className="mt-2 h-12 w-full rounded-full border border-white/12 bg-white/8 px-4 text-sm tracking-normal text-white outline-none transition placeholder:text-white/20 focus:border-[#6f9b54]/70"
      />
    </label>
  )
}

function AdminDesk({ config, employees, records, onError }: {
  config?: WelfareConfig
  employees: EmployeeView[]
  records: SignRecordView[]
  onError: (e: unknown) => void
}) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'config' | 'employees' | 'records'>('config')
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex rounded-md border bg-[var(--color-background)] p-1">
        <Tab active={tab === 'config'} onClick={() => setTab('config')}>配置</Tab>
        <Tab active={tab === 'employees'} onClick={() => setTab('employees')}>员工白名单</Tab>
        <Tab active={tab === 'records'} onClick={() => setTab('records')}>签名记录</Tab>
      </div>
      {tab === 'config' && config && <ConfigPanel config={config} onError={onError} />}
      {tab === 'employees' && <EmployeePanel employees={employees} onChanged={() => {
        void qc.invalidateQueries({ queryKey: ['welfare-sign-employees'] })
        void qc.invalidateQueries({ queryKey: ['welfare-sign-records'] })
      }} onError={onError} />}
      {tab === 'records' && <RecordPanel records={records} />}
    </div>
  )
}

function ConfigPanel({ config, onError }: { config: WelfareConfig; onError: (e: unknown) => void }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<WelfareConfig>(config)
  useEffect(() => setDraft(config), [config])
  const mut = useMutation({
    mutationFn: () => saveConfig(draft),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['welfare-sign-config'] }),
    onError,
  })
  return (
    <section className="grid gap-4 rounded-lg border bg-[var(--color-background)] p-5 lg:grid-cols-2">
      <Field label="登录方式">
        <select
          className="mt-1 h-10 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm"
          value={draft.loginMode}
          onChange={e => setDraft({ ...draft, loginMode: e.target.value as LoginMode })}
        >
          <option value="SMS">手机验证码</option>
          <option value="PASSWORD">自定义账号密码</option>
        </select>
      </Field>
      <Field label="签名完成后跳转链接">
        <Input value={draft.redirectUrl ?? ''} onChange={e => setDraft({ ...draft, redirectUrl: e.target.value })} />
      </Field>
      <Field label="登录图片 URL">
        <Input value={draft.loginImageUrl ?? ''} onChange={e => setDraft({ ...draft, loginImageUrl: e.target.value })} />
      </Field>
      <Field label="详情页图片 URL">
        <Input value={draft.detailImageUrl ?? ''} onChange={e => setDraft({ ...draft, detailImageUrl: e.target.value })} />
      </Field>
      <Field label="详情标题">
        <Input value={draft.detailTitle ?? ''} onChange={e => setDraft({ ...draft, detailTitle: e.target.value })} />
      </Field>
      <Field label="签名确认文案">
        <Input value={draft.signatureNotice ?? ''} onChange={e => setDraft({ ...draft, signatureNotice: e.target.value })} />
      </Field>
      <label className="lg:col-span-2 text-sm">
        福利品详情文案
        <textarea className="mt-1 min-h-28 w-full rounded-md border bg-[var(--color-background)] p-3 text-sm" value={draft.detailContent ?? ''} onChange={e => setDraft({ ...draft, detailContent: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.popupEnabled} onChange={e => setDraft({ ...draft, popupEnabled: e.target.checked })} />
        登录后弹框提示
      </label>
      <Field label="弹框标题">
        <Input value={draft.popupTitle ?? ''} onChange={e => setDraft({ ...draft, popupTitle: e.target.value })} />
      </Field>
      <label className="lg:col-span-2 text-sm">
        弹框内容
        <textarea className="mt-1 min-h-20 w-full rounded-md border bg-[var(--color-background)] p-3 text-sm" value={draft.popupContent ?? ''} onChange={e => setDraft({ ...draft, popupContent: e.target.value })} />
      </label>
      <label className="lg:col-span-2 text-sm">
        个性化字段 JSON
        <textarea className="mt-1 min-h-24 w-full rounded-md border bg-[var(--color-background)] p-3 font-mono text-xs" value={draft.extraFieldsJson ?? ''} onChange={e => setDraft({ ...draft, extraFieldsJson: e.target.value })} />
      </label>
      <div className="lg:col-span-2 flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}><Save className="size-4" />保存配置</Button>
      </div>
    </section>
  )
}

function EmployeePanel({ employees, onChanged, onError }: { employees: EmployeeView[]; onChanged: () => void; onError: (e: unknown) => void }) {
  const [editing, setEditing] = useState<EmployeeView | null>(null)
  const [draft, setDraft] = useState<EmployeePayload>(EMPTY_EMPLOYEE)
  const saveMut = useMutation({
    mutationFn: () => editing ? updateEmployee(editing.id, draft) : createEmployee(draft),
    onSuccess: () => { setEditing(null); setDraft(EMPTY_EMPLOYEE); onChanged() },
    onError,
  })
  const deleteMut = useMutation({ mutationFn: deleteEmployee, onSuccess: onChanged, onError })
  const startEdit = (e: EmployeeView) => {
    setEditing(e)
    setDraft({
      employeeNo: e.employeeNo,
      name: e.name,
      phone: e.phone ?? '',
      account: e.account ?? '',
      password: '',
      department: e.department ?? '',
      extraJson: e.extraJson ?? '',
      enabled: e.enabled,
    })
  }
  return (
    <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="rounded-lg border bg-[var(--color-background)] p-4">
        <h2 className="text-base font-semibold">{editing ? '编辑员工' : '新增员工'}</h2>
        <EmployeeForm value={draft} onChange={setDraft} />
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" disabled={saveMut.isPending || !draft.employeeNo || !draft.name} onClick={() => saveMut.mutate()}>
            <Plus className="size-4" />{editing ? '保存' : '新增'}
          </Button>
          {editing && <Button variant="outline" onClick={() => { setEditing(null); setDraft(EMPTY_EMPLOYEE) }}>取消</Button>}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border bg-[var(--color-background)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
            <tr><th className="p-2">员工</th><th className="p-2">联系方式</th><th className="p-2">状态</th><th className="p-2">签收</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {employees.map(e => (
              <tr key={e.id} className="border-t">
                <td className="p-2"><button className="font-medium hover:underline" onClick={() => startEdit(e)}>{e.name}</button><div className="text-xs text-[var(--color-muted-foreground)]">{e.employeeNo} · {e.department}</div></td>
                <td className="p-2 text-xs">{e.phone || '-'}<div>{e.account || ''}</div></td>
                <td className="p-2">{e.enabled ? '启用' : '停用'}</td>
                <td className="p-2">{e.signed ? '已签收' : '未签收'}</td>
                <td className="p-2 text-right"><Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(e.id)}><Trash2 className="size-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RecordPanel({ records }: { records: SignRecordView[] }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-[var(--color-background)]">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="font-semibold">签名记录</h2>
        <Button variant="outline" size="sm" onClick={() => { window.location.href = '/api/welfare-sign/records/export' }}>
          <Download className="size-4" />导出 CSV
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
          <tr><th className="p-2">员工</th><th className="p-2">部门</th><th className="p-2">签收时间</th><th className="p-2">个性化信息</th><th className="p-2">签名</th></tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.name}<div className="text-xs text-[var(--color-muted-foreground)]">{r.employeeNo} · {r.phone}</div></td>
              <td className="p-2">{r.department || '-'}</td>
              <td className="p-2">{new Date(r.signedAt).toLocaleString()}</td>
              <td className="max-w-xs truncate p-2 text-xs">{r.extraJson || '-'}</td>
              <td className="p-2"><img src={r.signatureData} alt="签名" className="h-10 rounded border bg-white" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function SignaturePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.floor(rect.width * window.devicePixelRatio)
    canvas.height = Math.floor(rect.height * window.devicePixelRatio)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111827'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
  }, [])
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const finish = () => {
    drawing.current = false
    if (hasInk.current) onChange(canvasRef.current?.toDataURL('image/png') ?? '')
  }
  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    hasInk.current = false
    onChange('')
  }
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span>手写签名</span>
        <button type="button" className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]" onClick={clear}>
          <Eraser className="size-3.5" />清空
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className={`h-40 w-full touch-none rounded-md border bg-white ${value ? 'border-emerald-400' : ''}`}
        onPointerDown={e => {
          drawing.current = true
          hasInk.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          const ctx = e.currentTarget.getContext('2d')!
          const p = point(e)
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
        }}
        onPointerMove={e => {
          if (!drawing.current) return
          const ctx = e.currentTarget.getContext('2d')!
          const p = point(e)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
    </div>
  )
}

function EmployeeForm({ value, onChange }: { value: EmployeePayload; onChange: (v: EmployeePayload) => void }) {
  return (
    <div className="mt-3 space-y-3">
      <Field label="员工编号"><Input value={value.employeeNo} onChange={e => onChange({ ...value, employeeNo: e.target.value })} /></Field>
      <Field label="姓名"><Input value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} /></Field>
      <Field label="手机号"><Input value={value.phone ?? ''} onChange={e => onChange({ ...value, phone: e.target.value })} /></Field>
      <Field label="账号"><Input value={value.account ?? ''} onChange={e => onChange({ ...value, account: e.target.value })} /></Field>
      <Field label="密码"><Input type="password" value={value.password ?? ''} onChange={e => onChange({ ...value, password: e.target.value })} /></Field>
      <Field label="部门"><Input value={value.department ?? ''} onChange={e => onChange({ ...value, department: e.target.value })} /></Field>
      <label className="block text-sm">扩展信息 JSON<textarea className="mt-1 min-h-16 w-full rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs" value={value.extraJson ?? ''} onChange={e => onChange({ ...value, extraJson: e.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.enabled} onChange={e => onChange({ ...value, enabled: e.target.checked })} />启用</label>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm">{label}<div className="mt-1">{children}</div></label>
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm ${active ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'}`}
    >
      {children}
    </button>
  )
}

function parseFields(raw?: string | null): ExtraField[] {
  if (!raw?.trim()) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter(x => typeof x?.key === 'string' && typeof x?.label === 'string')
  } catch {
    return []
  }
}
