import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionPendingSql } from '../types'
import { PendingSqlPanel } from './PendingSqlPanel'

const { getRegistration, saveRegistration } = vi.hoisted(() => ({
  getRegistration: vi.fn(),
  saveRegistration: vi.fn(),
}))

vi.mock('../api', () => ({
  getSessionPendingSql: getRegistration,
  saveSessionPendingSql: saveRegistration,
  deleteSessionPendingSql: vi.fn(),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))

vi.mock('./PendingSqlReviewWorkspace', () => ({
  PendingSqlReviewWorkspace: ({ sqlText, onSqlTextChange }: { sqlText: string; onSqlTextChange: (value: string) => void }) => (
    <div><span>{sqlText}</span><button type="button" onClick={() => onSqlTextChange('SELECT 2;')}>修改 SQL</button></div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const registration: SessionPendingSql = {
  sessionId: 'session-1', title: '系统生成标题', targetEnvironment: '生产库', changeType: 'DDL',
  sqlText: 'SELECT 1;', status: 'PENDING', createdAt: 1, updatedAt: 2, executedAt: null,
  ddlEvidenceStatus: 'VERIFIED', ddlProject: 'Forge', ddlBaselinePath: null, ddlEvidenceId: null,
  ddlVerifiedTables: [], ddlMissingTables: [], ddlCheckedAt: 2,
  targets: [{
    targetId: 'target-1', targetKey: 'db-1', datasourceId: 'db-1', targetEnvironment: '生产库',
    changeType: 'DDL', sqlText: 'SELECT 1;', status: 'PENDING', sortOrder: 0,
    createdAt: 1, updatedAt: 2, executedAt: null,
  }],
}

describe('PendingSqlPanel', () => {
  it('只呈现 SQL 编辑能力，不显示元数据配置控件', async () => {
    getRegistration.mockResolvedValue(registration)
    render(<PendingSqlPanel sessionId="session-1" onClose={vi.fn()} />)

    expect(await screen.findByText('SELECT 1;')).toBeInTheDocument()
    expect(screen.queryByText('登记标题')).not.toBeInTheDocument()
    expect(screen.queryByText('添加目标库 / 环境')).not.toBeInTheDocument()
    expect(screen.queryByText('当前库变更类型')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('保存 SQL 时保留登记来源提供的元数据', async () => {
    getRegistration.mockResolvedValue(registration)
    saveRegistration.mockImplementation(async (_sessionId, payload) => ({
      ...registration,
      sqlText: payload.sqlText,
      targets: registration.targets.map(target => ({ ...target, sqlText: payload.targets[0].sqlText })),
    }))
    render(<PendingSqlPanel sessionId="session-1" onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: '修改 SQL' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(saveRegistration).toHaveBeenCalledWith('session-1', expect.objectContaining({
      title: '系统生成标题',
      targetEnvironment: '生产库',
      changeType: 'DDL',
      targets: [expect.objectContaining({ targetEnvironment: '生产库', changeType: 'DDL', sqlText: 'SELECT 2;' })],
    })))
  })
})
