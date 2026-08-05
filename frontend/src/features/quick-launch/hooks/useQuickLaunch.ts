import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createQuickSite,
  deleteQuickSite,
  listQuickSites,
  recordQuickSiteOpened,
  updateQuickSite,
} from '../api'
import type { QuickSiteUpsert } from '../types'

const SITES_KEY = ['quick-launch', 'sites'] as const

export function useQuickSites() {
  return useQuery({ queryKey: SITES_KEY, queryFn: listQuickSites })
}

export function useSaveQuickSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string | null; payload: QuickSiteUpsert }) =>
      id ? updateQuickSite(id, payload) : createQuickSite(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SITES_KEY }),
  })
}

export function useDeleteQuickSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteQuickSite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SITES_KEY }),
  })
}

export function useRecordQuickSiteOpened() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: recordQuickSiteOpened,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SITES_KEY }),
  })
}
