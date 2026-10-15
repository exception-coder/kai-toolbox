/** 旧开发页不再维护另一套AI数据库连接，只保留到权威配置的恢复入口。 */
export function DatabaseResourceNotice() {
  return <section aria-label="数据库配置入口" className="my-5 border-y py-4 text-sm">
    <h2 className="font-medium">数据库由系统资源统一管理</h2>
    <p className="mt-2 text-xs leading-6 text-[var(--color-muted-foreground)]">旧独立连接已停止查询，历史配置保留。请登记业务系统、绑定测试数据库，并在业务咨询流程节点中明确选择；没有选择时不会自动查库。</p>
    <div className="mt-3 flex flex-wrap gap-4 text-xs">
      <a className="flex min-h-11 items-center underline" href="/tools/reqpool/resources?view=connections">管理连接与系统绑定</a>
      <a className="flex min-h-11 items-center underline" href="/tools/agent-management?agent=business-consult">配置业务咨询数据库</a>
    </div>
  </section>
}
