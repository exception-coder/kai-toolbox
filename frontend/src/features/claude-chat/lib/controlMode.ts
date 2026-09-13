export type ChatControlMode = 'CODE_AGENT' | 'LLM'

export function chatControlMode(search: string): ChatControlMode {
  return new URLSearchParams(search).get('control') === 'llm' ? 'LLM' : 'CODE_AGENT'
}

export function controlModeSearch(search: string, mode: ChatControlMode): string {
  const params = new URLSearchParams(search)
  if (mode === 'LLM') params.set('control', 'llm')
  else params.delete('control')
  const result = params.toString()
  return result ? `?${result}` : ''
}
