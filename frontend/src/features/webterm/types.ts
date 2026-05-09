export type ShellKind = 'powershell' | 'cmd'

export type ClientMessage =
  | { type: 'open'; shell: ShellKind; cwd?: string | null; cols: number; rows: number }
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'close' }

export type ServerMessage =
  | { type: 'ready'; sessionId: string; shell: ShellKind; cwd: string; pid: number }
  | { type: 'output'; data: string }
  | { type: 'exit'; code: number }
  | { type: 'error'; code: string; message: string }

export type SocketState = 'idle' | 'connecting' | 'opening' | 'ready' | 'closed' | 'error'
