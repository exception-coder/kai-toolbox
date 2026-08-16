import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listDatasources } from '@/features/ops/public-api'

const SELECTED_DATASOURCE_KEY = 'kai-toolbox.db-console.datasource-id'

export function useDbConsole() {
  const datasourcesQuery = useQuery({
    queryKey: ['ops', 'datasources'],
    queryFn: () => listDatasources(),
  })
  const datasources = useMemo(
    () => (datasourcesQuery.data ?? []).filter(datasource => datasource.category === 'SQL'),
    [datasourcesQuery.data],
  )
  const [preferredId, setPreferredId] = useState(() => localStorage.getItem(SELECTED_DATASOURCE_KEY))
  const selected = datasources.find(datasource => datasource.id === preferredId) ?? datasources[0] ?? null

  function selectDatasource(id: string) {
    localStorage.setItem(SELECTED_DATASOURCE_KEY, id)
    setPreferredId(id)
  }

  return { datasourcesQuery, datasources, selected, selectDatasource }
}
