import { describe, expect, it } from 'vitest'
import { filterTasks } from './viewModel'
import type { OpenSpecTask } from './types'

const tasks: OpenSpecTask[] = [
  { id: '1', outlineId: '1.1', description: 'Build OpenSpec adapter', section: '1', state: 'TODO', runtime: null },
  { id: '2', outlineId: '2.1', description: 'Render board columns', section: '2', state: 'DONE', runtime: null },
]

describe('filterTasks', () => {
  it('filters by query and state without losing source tasks', () => {
    expect(filterTasks(tasks, 'adapter', 'TODO')).toEqual([tasks[0]])
    expect(filterTasks(tasks, '2.1', 'ALL')).toEqual([tasks[1]])
    expect(tasks).toHaveLength(2)
  })
})
