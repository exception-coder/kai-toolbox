import type { Entry, FileEntry, TextEntry, VoiceEntry } from '../types'
import { tryGetGeo } from './geo'

// entry 工厂：统一注入 id / createdAt / inputMethod / geo
// 三种录入方式各自一个工厂入参，对外只露 { entry, blob? } 结果

export interface TextInput {
  kind: 'text'
  text: string
}

export interface VoiceInput {
  kind: 'voice'
  blob: Blob
  durationMs: number
  mimeType: string
}

export interface FileInput {
  kind: 'file'
  file: File
}

export type CreateEntryInput = TextInput | VoiceInput | FileInput

export interface CreatedEntry {
  entry: Entry
  blob?: Blob
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // 兜底：当前时间戳 + 36 进制随机串
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function createEntry(input: CreateEntryInput): Promise<CreatedEntry> {
  // 地理位置最多等 4s，失败一律 null
  const geo = await tryGetGeo(4000)
  const base = {
    id: newId(),
    createdAt: Date.now(),
    geo,
  }
  switch (input.kind) {
    case 'text': {
      const entry: TextEntry = {
        ...base,
        inputMethod: 'text',
        text: input.text,
      }
      return { entry }
    }
    case 'voice': {
      const entry: VoiceEntry = {
        ...base,
        inputMethod: 'voice',
        durationMs: input.durationMs,
        mimeType: input.mimeType || input.blob.type || 'audio/webm',
      }
      return { entry, blob: input.blob }
    }
    case 'file': {
      const entry: FileEntry = {
        ...base,
        inputMethod: 'file',
        fileName: input.file.name,
        fileSize: input.file.size,
        mimeType: input.file.type || 'application/octet-stream',
      }
      return { entry, blob: input.file }
    }
  }
}
