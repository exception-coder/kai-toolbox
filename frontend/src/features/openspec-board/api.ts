import { http } from '@/lib/api'
import type { OpenSpecBoardList, OpenSpecChangeDetail } from './types'

export function getOpenSpecBoards(refresh = false) {
  return http<OpenSpecBoardList>(`/claude-chat/openspec/boards?refresh=${refresh}`)
}

export function getOpenSpecChange(projectId: string, changeId: string, refresh = false) {
  return http<OpenSpecChangeDetail>(
    `/claude-chat/openspec/boards/${encodeURIComponent(projectId)}/changes/${encodeURIComponent(changeId)}?refresh=${refresh}`,
  )
}
