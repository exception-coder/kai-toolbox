import { TableIcon } from 'lucide-react'

/** SQL 结果表格：SqlConsole 与历史详情共用。 */
export function ResultTable({ columns, rows }: { columns: string[]; rows: (string | null)[][] }) {
  if (columns.length === 0) return null
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-[var(--color-muted-foreground)]">
        <TableIcon className="mx-auto mb-1 size-4" />
        查询成功，无数据行
      </div>
    )
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-[var(--color-muted)]/60 text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
          <tr>
            <th className="border-b px-2 py-1.5 text-right">#</th>
            {columns.map(c => (
              <th key={c} className="border-b px-3 py-1.5 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="odd:bg-[var(--color-muted)]/20">
              <td className="border-b px-2 py-1 text-right text-xs text-[var(--color-muted-foreground)]">{ri + 1}</td>
              {row.map((cell, ci) => (
                <td key={ci} className="border-b px-3 py-1 font-mono text-xs">
                  {cell === null
                    ? <span className="italic text-[var(--color-muted-foreground)]">NULL</span>
                    : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Redis 结果递归渲染：RedisConsole 与历史详情共用。 */
export function RedisValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="italic text-[var(--color-muted-foreground)]">(nil)</span>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="italic text-[var(--color-muted-foreground)]">(empty array)</span>
    }
    return (
      <ol className="space-y-0.5">
        {value.map((item, i) => (
          <li key={i} className="flex gap-2 font-mono text-xs">
            <span className="w-8 shrink-0 text-right text-[var(--color-muted-foreground)]">{i + 1})</span>
            <span className="min-w-0 break-all"><RedisValue value={item} /></span>
          </li>
        ))}
      </ol>
    )
  }
  return <span className="font-mono text-xs break-all">{String(value)}</span>
}
