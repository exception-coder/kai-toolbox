import { useQuery } from '@tanstack/react-query'
import { getConsultAccountAudit, type BusinessConsultModelPolicy } from '../api'

/** Evidence stays with the existing setting; ordinary users need no account operation. */
export function ConsultAccountPolicyStatus({ policy }: { policy?: BusinessConsultModelPolicy }) {
  const audit = useQuery({ queryKey: ['consult-account-audit', policy?.version], queryFn: getConsultAccountAudit })
  return <div className="w-full space-y-2 border-t border-border pt-3 text-xs text-muted-foreground" data-testid="consult-account-policy-status">
    <p>新咨询及历史咨询的后续提问将使用此账号；正在生成的回答完成后生效。</p>
    <p>策略版本 {policy?.version ?? 0} · {policy?.validationCode === 'VALID' ? '账号检测通过' : '账号尚未检测'}
      {policy?.checkedAt ? ` · ${new Date(policy.checkedAt).toLocaleString()}` : ''}</p>
    <details>
      <summary className="cursor-pointer py-2">账号切换记录</summary>
      {audit.isLoading && <p role="status">正在读取记录…</p>}
      {audit.isError && <div><p role="alert">切换记录暂时无法读取</p><button type="button" className="min-h-11 underline" onClick={() => void audit.refetch()}>重试</button></div>}
      {audit.data?.length === 0 && <p>暂无切换记录。</p>}
      <ol className="divide-y divide-border">
        {audit.data?.map(row => <li key={row.version} className="space-y-1 py-3 break-all">
          <p>{new Date(row.checked_at).toLocaleString()} · 操作者 {row.operator_id} · {row.result_code === 'VALID' ? `已保存 v${row.version}` : '检测失败，配置未变'}</p>
          <p>{row.previous_home ?? '未配置'} → {row.target_home}</p><p>{row.model}</p>
        </li>)}
      </ol>
    </details>
  </div>
}
