const CODEX_HOME_PREF = 'kai-toolbox:fore-consult:codex-home'

export function loadCodexHomePreference(): string {
  try {
    return localStorage.getItem(CODEX_HOME_PREF) ?? ''
  } catch {
    return ''
  }
}

export function saveCodexHomePreference(codexHome: string): void {
  try {
    localStorage.setItem(CODEX_HOME_PREF, codexHome.trim())
  } catch {
    // 浏览器禁用存储时仅本次会话生效。
  }
}
