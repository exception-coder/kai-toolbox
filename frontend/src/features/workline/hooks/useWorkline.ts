import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createEntry,
  createLine,
  deleteEntry,
  deleteLine,
  listEntries,
  listLines,
  updateEntry,
  updateLine,
} from '../api'
import type { EntryUpsert, WorklineUpsert } from '../types'

const LINES_KEY = ['workline', 'lines'] as const
const entriesKey = (lineId: number) => ['workline', 'entries', lineId] as const

export function useLines() {
  return useQuery({ queryKey: LINES_KEY, queryFn: listLines })
}

export function useEntries(lineId: number | null) {
  return useQuery({
    queryKey: entriesKey(lineId ?? -1),
    queryFn: () => listEntries(lineId as number),
    enabled: lineId != null,
  })
}

export function useSaveLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number | null; payload: WorklineUpsert }) =>
      input.id == null ? createLine(input.payload) : updateLine(input.id, input.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: LINES_KEY }),
  })
}

export function useDeleteLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteLine(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: LINES_KEY }),
  })
}

export function useSaveEntry(lineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number | null; payload: EntryUpsert }) =>
      input.id == null ? createEntry(lineId, input.payload) : updateEntry(input.id, input.payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: entriesKey(lineId) })
      // 条目数变化要刷新左栏的工作线列表
      qc.invalidateQueries({ queryKey: LINES_KEY })
    },
  })
}

export function useDeleteEntry(lineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: entriesKey(lineId) })
      qc.invalidateQueries({ queryKey: LINES_KEY })
    },
  })
}
