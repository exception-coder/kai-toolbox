export function splitExt(name: string): { stem: string; ext: string } {
  const lastDot = name.lastIndexOf('.')
  // 隐藏文件（如 .bashrc）整体视为 stem，无扩展名
  if (lastDot <= 0) return { stem: name, ext: '' }
  return { stem: name.slice(0, lastDot), ext: name.slice(lastDot) }
}

/**
 * 给文件名追加 `+1`, `+2`, ... 直到不与 `used` 冲突；命中即 mutate `used`。
 * 序号加在 stem 上，不影响扩展名：`report.pdf` → `report+1.pdf`。
 */
export function pickNonConflicting(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const { stem, ext } = splitExt(name)
  for (let i = 1; ; i++) {
    const candidate = `${stem}+${i}${ext}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
}

export function basename(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i < 0 ? path : path.slice(i + 1)
}

export function normalizePath(p: string): string {
  let s = p.trim().replace(/\\/g, '/')
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s
}
