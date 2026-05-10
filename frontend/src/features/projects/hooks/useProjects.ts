import { useQuery } from '@tanstack/react-query'
import { listProjects } from '../api'

export function useProjects() {
  return useQuery({
    queryKey: ['projects', 'list'],
    queryFn: listProjects,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  })
}
