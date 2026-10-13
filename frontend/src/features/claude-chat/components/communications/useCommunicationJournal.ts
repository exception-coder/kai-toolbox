import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getUser } from '@/lib/auth'
import { getCommunication, listCommunications, type CommunicationFilter } from '../../api/communicationJournal'

export function useCommunicationJournal(sessionId: string, initialRecordId?: string) {
  const client = useQueryClient(), alive = useRef(true), userScope = getUser()?.userId ?? 'local'
  const queryRoot = ['communications', userScope, sessionId]
  const [search, setSearch] = useState(''), [filter, setFilter] = useState<CommunicationFilter>({ q: '', order: 'desc', notes: 'all', removed: false, page: 0 })
  const [selectedId, setSelectedId] = useState(initialRecordId ?? ''), [selection, setSelection] = useState<string[]>([])
  const [notice, setNotice] = useState(''), [error, setError] = useState('')
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (initialRecordId) setSelectedId(initialRecordId) }, [initialRecordId])
  useEffect(() => { const timeout = setTimeout(() => setFilter(value => ({ ...value, q: search, page: 0 })), 250); return () => clearTimeout(timeout) }, [search])
  const list = useQuery({ queryKey: [...queryRoot, 'list', filter], queryFn: ({ signal }) => listCommunications(sessionId, filter, signal), retry: false })
  const detail = useQuery({ queryKey: [...queryRoot, 'detail', selectedId], queryFn: ({ signal }) => getCommunication(sessionId, selectedId, signal), enabled: !!selectedId, retry: false })
  const refresh = () => { void client.invalidateQueries({ queryKey: queryRoot }) }
  const updateFilter = (patch: Partial<CommunicationFilter>) => {
    setFilter(value => ({ ...value, ...patch, page: patch.page ?? 0 })); setSelection([]); setSelectedId('')
  }
  return { sessionId, userScope, client, queryRoot, alive, search, setSearch, filter, setFilter, selectedId, setSelectedId,
    selection, setSelection, notice, setNotice, error, setError, list, detail, refresh, updateFilter }
}
export type CommunicationJournal = ReturnType<typeof useCommunicationJournal>
