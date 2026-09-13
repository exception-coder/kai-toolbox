import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeChatSessionView, ProjectModule } from '@/features/claude-chat/public-api'
import { normalizePath } from '../lib/workspaceModel'
import { WorkspaceModuleList } from './WorkspaceModuleList'

afterEach(cleanup)

const moduleOf = (name: string): ProjectModule => ({ name, relPath: `frontend/src/features/${name}`, absPath: `D:/project/${name}`, type: 'knowledge' })
const actions = () => ({ sessionByCwd: new Map<string, ClaudeChatSessionView>(), pendingPath: null, onOpen: vi.fn(), isPinned: () => false, onPin: vi.fn() })

describe('compact workspace modules', () => {
  it('limits large lists, supports expand/collapse and leaves search results complete', () => {
    const modules = Array.from({ length: 15 }, (_, index) => moduleOf(`module-${index}`))
    const props = actions()
    const view = render(<WorkspaceModuleList modules={modules} searchActive={false} {...props} />)
    expect(screen.getAllByRole('button', { name: /^新建会话：/ })).toHaveLength(12)
    expect(screen.queryByText('knowledge')).toBeNull()
    expect(screen.queryByText('未打开')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '展开其余 3 项' }))
    expect(screen.getAllByRole('button', { name: /^新建会话：/ })).toHaveLength(15)
    fireEvent.click(screen.getByRole('button', { name: '收起模块' }))
    expect(screen.queryByText('module-14')).toBeNull()
    view.rerender(<WorkspaceModuleList modules={modules} searchActive {...props} />)
    expect(screen.getAllByRole('button', { name: /^新建会话：/ })).toHaveLength(15)
  })

  it('preserves session and pin callbacks, accessible state and full path', () => {
    const module = moduleOf('账号管理')
    const props = actions()
    props.sessionByCwd.set(normalizePath(module.absPath), { id: 'existing' } as ClaudeChatSessionView)
    const view = render(<WorkspaceModuleList modules={[module]} searchActive={false} {...props} isPinned={() => true} />)
    fireEvent.click(screen.getByRole('button', { name: '打开会话：账号管理' }))
    expect(props.onOpen).toHaveBeenCalledWith(module)
    fireEvent.click(screen.getByRole('button', { name: '取消钉选：账号管理', pressed: true }))
    expect(props.onPin).toHaveBeenCalledWith(module)
    expect(screen.getByTitle(module.relPath)).toBeTruthy()
    view.rerender(<WorkspaceModuleList modules={[module]} searchActive={false} {...props} pendingPath={module.absPath} />)
    expect((screen.getByRole('button', { name: '打开会话：账号管理' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('expands nested modules and avoids labeling mixed modules as frontend-only', () => {
    const child = moduleOf('child')
    const root = { ...moduleOf('backend'), relPath: 'tools/tool-example', type: 'maven', children: [child] }
    const props = actions()
    render(<WorkspaceModuleList modules={[root]} searchActive={false} {...props} />)
    expect(screen.getByRole('region', { name: '项目模块' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '新建会话：child' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '展开子模块：backend（1）' }))
    fireEvent.click(screen.getByRole('button', { name: '新建会话：child' }))
    expect(props.onOpen).toHaveBeenCalledWith(child)
    fireEvent.click(screen.getByRole('button', { name: '收起子模块：backend（1）' }))
    expect(screen.queryByRole('button', { name: '新建会话：child' })).toBeNull()
  })
})
