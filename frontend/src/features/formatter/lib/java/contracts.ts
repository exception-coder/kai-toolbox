export type JavaInputMode = 'auto' | 'file' | 'member' | 'statements' | 'expression'
export type JavaIndent = '2' | '4' | 'tab'

export interface JavaFormatOptions {
  mode: JavaInputMode
  indent: JavaIndent
  printWidth: number
}

export const DEFAULT_JAVA_OPTIONS: JavaFormatOptions = { mode: 'auto', indent: '4', printWidth: 100 }
export const JAVA_MAX_BYTES = 256 * 1024

export type JavaFormatResult =
  | { ok: true; output: string; kind: string }
  | { ok: false; error: string; position?: number }

export interface JavaWorkerRequest { id: number; input: string; options: JavaFormatOptions }
export interface JavaWorkerResponse { id: number; result: JavaFormatResult }
