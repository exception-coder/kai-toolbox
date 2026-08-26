import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SuiteOperations({
  running,
  onInstall,
  onUpdate,
}: {
  running: boolean
  onInstall: () => void
  onUpdate: () => void
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">Team Suite Lifecycle</p>
      <h2 className="mt-2 text-base font-semibold">公司套件</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">
        固定工作区 <code className="font-mono text-[11px]">~/.kai-toolbox/team-tools</code>。先安全拉取 Git 仓库，再从本地构建并安装。
      </p>
      <div className="mt-4 grid gap-2">
        <Button variant="outline" onClick={onInstall} disabled={running}>
          <Download /> 一键安装套件
        </Button>
        <Button onClick={onUpdate} disabled={running}>
          <RefreshCw className={running ? 'animate-spin' : undefined} /> 一键更新套件
        </Button>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[var(--color-muted-foreground)]">
        本地仓有未提交修改时会停止操作并保留现场，不会删除或强制覆盖。
      </p>
    </section>
  )
}
