/** 输入框行首打 `/` 时的命令补全浮层。命令清单来自 SDK init（含内置 + 自定义）。 */
export function SlashCommandMenu({
  commands,
  activeIndex,
  onPick,
}: {
  commands: string[]
  activeIndex: number
  onPick: (cmd: string) => void
}) {
  if (commands.length === 0) return null
  return (
    <div className="mx-3 mb-1 max-h-56 overflow-y-auto rounded-lg border bg-[var(--color-background)] shadow-lg">
      {commands.map((c, i) => (
        <button
          key={c}
          type="button"
          // onMouseDown 而非 onClick：避免 textarea 先 blur 抢焦点导致点击落空
          onMouseDown={e => { e.preventDefault(); onPick(c) }}
          className={
            'block w-full px-3 py-2 text-left font-mono text-sm ' +
            (i === activeIndex ? 'bg-[var(--color-muted)]' : 'hover:bg-[var(--color-muted)]')
          }
        >
          /{c}
        </button>
      ))}
    </div>
  )
}
