import { useSearchParams } from 'react-router-dom'

export function useEvaluationSelection() {
  const [params, setParams] = useSearchParams()
  const update = (values: Record<string, string | null>) => setParams(previous => {
    const next = new URLSearchParams(previous)
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    return next
  })
  return {
    dataset: params.get('dataset') || '',
    selectedRun: params.get('run') || '',
    baseRun: params.get('base') || '',
    requestedAdapter: params.get('adapter') || '',
    setDataset: (dataset: string) => update({ dataset, run: null, base: null, adapter: null }),
    setSelectedRun: (run: string) => update({ run }),
    setBaseRun: (base: string) => update({ base }),
    setAdapter: (adapter: string) => update({ adapter }),
    removeRun: (runId: string) => update({
      run: params.get('run') === runId ? null : params.get('run'),
      base: params.get('base') === runId ? null : params.get('base'),
    }),
  }
}
