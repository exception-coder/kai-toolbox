// 个人秘书模块的领域类型
// 三种录入方式各自独立的 entry 子类型，外加可选地理位置

export type InputMethod = 'text' | 'voice' | 'file'

export interface EntryGeo {
  latitude: number
  longitude: number
  /** 精度半径（米） */
  accuracy: number
  /** 拿到该坐标的时间戳 */
  capturedAt: number
}

interface BaseEntry {
  id: string
  /** 入库时间戳 = Date.now() */
  createdAt: number
  inputMethod: InputMethod
  /** 取不到 / 用户拒绝 / 超时一律 null */
  geo: EntryGeo | null
  /** 用户额外备注（可选） */
  note?: string
}

export interface TextEntry extends BaseEntry {
  inputMethod: 'text'
  text: string
}

export interface VoiceEntry extends BaseEntry {
  inputMethod: 'voice'
  durationMs: number
  mimeType: string
}

export interface FileEntry extends BaseEntry {
  inputMethod: 'file'
  fileName: string
  fileSize: number
  mimeType: string
}

export type Entry = TextEntry | VoiceEntry | FileEntry
